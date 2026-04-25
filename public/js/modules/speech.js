let appRef = null;
let speechSynthesisUtterance = null;
let currentAudio = null;
let isPlayingQueue = false;

const ttsEndpoint = '/api/tts';

function setup(app) {
  appRef = app;
}

function getSelectedVoiceName() {
  return appRef.dom.voiceSelect?.value || 'en-GB-SoniaNeural';
}

function getNativeVoiceForSelection(availableVoices, edgeVoiceName) {
  const selectionMap = {
    'en-GB-SoniaNeural': ['Daniel', 'Samantha'],
    'en-GB-RyanNeural': ['Daniel', 'Alex'],
    'en-US-AriaNeural': ['Samantha', 'Ava'],
    'en-US-GuyNeural': ['Alex', 'Aaron']
  };
  const preferredNames = selectionMap[edgeVoiceName] || [];

  for (const preferredName of preferredNames) {
    const matchedVoice = availableVoices.find((voice) => voice.name.includes(preferredName));
    if (matchedVoice) {
      return matchedVoice;
    }
  }

  if (edgeVoiceName.startsWith('en-GB')) {
    return availableVoices.find((voice) => voice.lang === 'en-GB')
      || availableVoices.find((voice) => voice.lang.startsWith('en-GB'));
  }

  if (edgeVoiceName.startsWith('en-US')) {
    return availableVoices.find((voice) => voice.lang === 'en-US')
      || availableVoices.find((voice) => voice.lang.startsWith('en-US'));
  }

  return availableVoices.find((voice) => voice.lang.startsWith('en'));
}

function clearAudioCache() {
  if (window.audioCache instanceof Map) {
    window.audioCache.forEach((url) => url && URL.revokeObjectURL(url));
    window.audioCache.clear();
  }
  window.audioCache = null;
}

function resetReadAloudButton() {
  appRef.dom.readAloudBtn.textContent = '朗读';
  appRef.dom.readAloudBtn.classList.remove('speaking');
}

async function ensureVoicesLoaded() {
  let availableVoices = window.speechSynthesis.getVoices();
  if (availableVoices.length > 0) {
    return availableVoices;
  }

  await new Promise((resolve) => {
    let attempts = 0;
    const checkVoices = setInterval(() => {
      availableVoices = window.speechSynthesis.getVoices();
      attempts += 1;
      if (availableVoices.length > 0 || attempts > 10) {
        clearInterval(checkVoices);
        resolve();
      }
    }, 100);
  });

  return window.speechSynthesis.getVoices();
}

async function speakWithNativeTts(text, options = {}) {
  const {
    edgeVoiceName,
    rate,
    volume,
    pitch,
    localOnly = false
  } = options;

  if (!('speechSynthesis' in window)) {
    throw new Error('您的浏览器不支持语音朗读功能');
  }

  const availableVoices = await ensureVoicesLoaded();
  let voicePool = availableVoices;

  if (localOnly) {
    voicePool = availableVoices.filter((voice) => voice.localService && !/google/i.test(voice.name));
    if (voicePool.length === 0) {
      voicePool = availableVoices.filter((voice) => voice.localService);
    }
    if (voicePool.length === 0) {
      throw new Error('未找到可用的本地语音，请先在系统中安装语音包');
    }
  }

  const selectedNativeVoice = getNativeVoiceForSelection(voicePool, edgeVoiceName)
    || voicePool.find((voice) => voice.lang.startsWith('en') && !voice.localService)
    || voicePool.find((voice) => voice.lang.startsWith('en') && voice.localService)
    || voicePool.find((voice) => voice.lang.startsWith('en'))
    || voicePool[0];

  speechSynthesisUtterance = new SpeechSynthesisUtterance(text);
  speechSynthesisUtterance.lang = 'en-US';
  speechSynthesisUtterance.rate = rate;
  speechSynthesisUtterance.volume = volume;
  speechSynthesisUtterance.pitch = pitch;

  if (selectedNativeVoice) {
    speechSynthesisUtterance.voice = selectedNativeVoice;
  }

  speechSynthesisUtterance.onstart = () => {
    appRef.dom.readAloudBtn.textContent = '停止';
    appRef.dom.readAloudBtn.classList.add('speaking');
  };

  speechSynthesisUtterance.onend = () => {
    resetReadAloudButton();
  };

  speechSynthesisUtterance.onerror = (event) => {
    resetReadAloudButton();
    if (event.error !== 'interrupted') {
      appRef.addSystemMessage(`朗读失败: ${event.error}`);
    }
  };

  window.speechSynthesis.speak(speechSynthesisUtterance);
}

async function requestEdgeTtsAudio(text, options = {}) {
  const {
    voice,
    rate,
    volume,
    pitch
  } = options;
  const requestBody = {
    text,
    voice,
    rate: `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`,
    volume: `${volume >= 1 ? '+' : ''}${Math.round((volume - 1) * 100)}%`,
    pitch: `${pitch >= 1 ? '+' : ''}${Math.round((pitch - 1) * 50)}Hz`
  };

  const response = await fetch(ttsEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': appRef.getCsrfToken()
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorMessage = 'TTS服务请求失败';
    try {
      const errorData = await response.json();
      errorMessage = errorData?.error || errorMessage;
    } catch (error) {
      const errorText = await response.text().catch(() => '');
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const audioBlob = await response.blob();
  return {
    audioUrl: URL.createObjectURL(audioBlob),
    upstream: response.headers.get('X-TTS-Upstream') || 'primary'
  };
}

async function playWithEdgeTts(text, options = {}) {
  const {
    voice,
    rate,
    volume,
    pitch
  } = options;

  appRef.dom.readAloudBtn.textContent = '停止';
  appRef.dom.readAloudBtn.classList.add('speaking');
  isPlayingQueue = true;

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const maxConcurrent = 3;
  let sentenceIndex = 1;
  let playIndex = 0;
  const audioCache = new Map();
  window.audioCache = audioCache;
  let activeFetches = 0;
  let isPlaying = false;
  let backupNoticeShown = false;
  let localFallbackStarted = false;

  const announceBackupFallback = () => {
    if (backupNoticeShown) {
      return;
    }
    backupNoticeShown = true;
    appRef.addSystemMessage('主 edge-tts 服务不可用，已自动切换到备用朗读服务');
  };

  const fallbackToNativeFromSentence = async (startIndex) => {
    if (localFallbackStarted) {
      return;
    }
    localFallbackStarted = true;

    const remainingText = sentences
      .slice(startIndex)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .join(' ');

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }

    isPlayingQueue = false;
    clearAudioCache();
    resetReadAloudButton();

    if (!remainingText) {
      return;
    }

    try {
      appRef.addSystemMessage('主备 edge-tts 服务均不可用，已自动切换到本地语音库');
      await speakWithNativeTts(remainingText, {
        edgeVoiceName: voice,
        rate,
        volume,
        pitch,
        localOnly: true
      });
    } catch (fallbackError) {
      resetReadAloudButton();
      appRef.addSystemMessage(`朗读失败: ${fallbackError.message}`);
    }
  };

  const firstSentence = sentences[0]?.trim();
  if (!firstSentence) {
    throw new Error('没有可朗读文本');
  }
  const firstAudioResult = await requestEdgeTtsAudio(firstSentence, { voice, rate, volume, pitch });
  if (firstAudioResult.upstream === 'backup') {
    announceBackupFallback();
  }
  audioCache.set(0, firstAudioResult.audioUrl);

  const playNext = async () => {
    if (!isPlayingQueue || playIndex >= sentences.length || isPlaying || localFallbackStarted) {
      if (playIndex >= sentences.length) {
        isPlayingQueue = false;
        clearAudioCache();
        resetReadAloudButton();
      }
      return;
    }

    if (!audioCache.has(playIndex)) return;

    const audioUrl = audioCache.get(playIndex);
    playIndex += 1;

    if (!audioUrl) {
      playNext();
      return;
    }

    isPlaying = true;
    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => {
      isPlaying = false;
      currentAudio = null;
      playNext();
    };
    currentAudio.onerror = () => {
      isPlaying = false;
      currentAudio = null;
      playNext();
    };

    try {
      await currentAudio.play();
    } catch (error) {
      isPlaying = false;
      currentAudio = null;
      playNext();
    }
  };

  const fetchAudio = async (index) => {
    if (index >= sentences.length || !isPlayingQueue || localFallbackStarted) return;

    activeFetches += 1;
    try {
      const sentenceText = sentences[index].trim();
      if (!sentenceText) {
        audioCache.set(index, null);
        return;
      }
      const audioResult = await requestEdgeTtsAudio(sentenceText, { voice, rate, volume, pitch });
      if (audioResult.upstream === 'backup') {
        announceBackupFallback();
      }
      if (!isPlayingQueue || localFallbackStarted) {
        URL.revokeObjectURL(audioResult.audioUrl);
        return;
      }
      audioCache.set(index, audioResult.audioUrl);
      if (index === playIndex && !isPlaying) {
        playNext();
      }
    } catch (error) {
      audioCache.set(index, null);
      await fallbackToNativeFromSentence(Math.min(index, playIndex));
    } finally {
      activeFetches -= 1;
      if (!localFallbackStarted && sentenceIndex < sentences.length && activeFetches < maxConcurrent) {
        fetchAudio(sentenceIndex++);
      }
    }
  };

  for (let i = 0; i < Math.min(maxConcurrent - 1, sentences.length - 1); i += 1) {
    fetchAudio(sentenceIndex++);
  }
  playNext();
}

function stopPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  isPlayingQueue = false;
  clearAudioCache();
  resetReadAloudButton();
}

async function handleReadAloudClick() {
  const isSpeakingNatively = 'speechSynthesis' in window && window.speechSynthesis.speaking;

  if ((currentAudio && !currentAudio.paused) || isSpeakingNatively || isPlayingQueue) {
    stopPlayback();
    return;
  }

  const currentSelection = appRef.getCurrentSelection();
  if (!currentSelection) {
    appRef.addSystemMessage('请先选择要朗读的文本');
    return;
  }

  const selectedVoice = getSelectedVoiceName();
  const rate = parseFloat(appRef.dom.speechRateInput.value) || 0.9;
  const volume = parseFloat(appRef.dom.speechVolumeInput.value) || 1.0;
  const pitch = parseFloat(appRef.dom.speechPitchInput.value) || 1.0;

  try {
    await playWithEdgeTts(currentSelection, {
      voice: selectedVoice,
      rate,
      volume,
      pitch
    });
  } catch (error) {
    isPlayingQueue = false;
    clearAudioCache();
    resetReadAloudButton();
    try {
      appRef.addSystemMessage('主备 edge-tts 服务均不可用，已自动切换到本地语音库');
      await speakWithNativeTts(currentSelection, {
        edgeVoiceName: selectedVoice,
        rate,
        volume,
        pitch,
        localOnly: true
      });
    } catch (fallbackError) {
      resetReadAloudButton();
      appRef.addSystemMessage(`朗读失败: ${fallbackError.message}`);
    }
  }
}

function resetState() {
  stopPlayback();
}

export {
  setup,
  handleReadAloudClick,
  resetState
};
