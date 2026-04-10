你是一位专业的英语老师。请认真阅读下面的文章，并根据文章内容使用英文生成10个开放性问题及参考答案。

**重要要求：**
1. 必须返回纯JSON格式，不要添加任何其他文字说明
2. 可以用```json代码块包裹JSON
3. 顶层必须是一个对象，且必须只包含 `questions` 这一个字段
4. `questions` 必须是长度为10的数组
5. 每一道题都必须包含且只包含 `id`、`question`、`answer` 这3个字段
6. `id` 必须是字符串数字，从"1"到"10"，按顺序递增
7. `question` 必须是英文开放性问题，不能为空
8. `answer` 必须是英文参考答案，不能为空，且至少2句完整英文句子
9. 不要使用 `prompt`、`stem`、`content`、`reference_answer`、`sample_answer`、`explanation`、`solution` 等其他字段名
10. 不要输出 Markdown 标题、注释、解释、前后缀文字；只输出最终JSON

**JSON格式模板：**
```json
{
  "questions": [
    {
      "id": "1",
      "question": "What is the main idea of the passage?",
      "answer": "The passage mainly discusses how modern technology influences daily communication. It explains both the convenience it provides and the challenges it creates for deeper human interaction."
    },
    {
      "id": "2",
      "question": "How does the author support the central claim?",
      "answer": "The author supports the claim by using examples from real-life communication habits. The passage also references observable social changes to make the argument more convincing."
    }
  ]
}
```

**文章内容：**
${passageContent}
