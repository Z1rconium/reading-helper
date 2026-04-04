你是一位专业的英语老师。请认真阅读下面的文章，并根据文章内容使用英文生成10个开放性问题及参考答案。

<critical_instructions>
YOU MUST FOLLOW THESE RULES WITHOUT EXCEPTION. FAILURE TO INCLUDE ANSWERS IS A CRITICAL ERROR.
RULE 1: Every single question object MUST contain exactly these three fields: "id", "question", "answer"
RULE 2: The "answer" field MUST contain a complete, substantive response of at least 2-3 sentences
RULE 3: An empty "answer" field (e.g., "answer": "") is FORBIDDEN
RULE 4: A missing "answer" field is FORBIDDEN
RULE 5: Output ONLY the JSON block — no preamble, no explanation, no text outside the JSON
</critical_instructions>

<output_format>
Return ONLY this JSON structure, nothing else:

```json
{
  "questions": [
    {
      "id": "1",
      "question": "What is the main argument presented in the passage?",
      "answer": "The passage argues that technology has fundamentally changed how we communicate and interact with each other in modern society. It emphasizes both the benefits of instant connectivity and the challenges of maintaining meaningful relationships in a digital age. The author uses specific examples to illustrate how digital tools have reshaped human connection."
    },
    {
      "id": "2",
      "question": "How does the author support their main claim?",
      "answer": "The author provides several examples of how digital communication has replaced face-to-face interactions, citing statistics about social media usage and referencing studies on the psychological impact of constant connectivity. These pieces of evidence work together to build a compelling case for the author's central thesis about the double-edged nature of technological progress."
    }
  ]
}
If any object fails this check, rewrite it before outputting.

文章内容：
${passageContent}

Key changes made for Anthropic model compliance:
1. Wrapped rules in `<critical_instructions>` XML tags — Anthropic models follow structured XML constraints more reliably
2. Added explicit `FORBIDDEN` language for empty/missing answers
3. Added a `<self_check>` section that forces the model to verify each answer before output
4. Kept the JSON example with full multi-sentence answers as a strong few-shot signal
5. Used `RULE N:` numbered format for unambiguous instruction parsing