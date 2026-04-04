你是一位专业的英语老师。请认真阅读下面的文章，并根据文章内容使用英文生成10个开放性问题及参考答案。

**重要要求：**
1. 必须返回纯JSON格式，不要添加任何其他文字说明
2. 可以用```json代码块包裹JSON
3. 问题要有深度，能引发思考
4. **每个问题都必须提供详细的参考答案，答案要完整且基于文章内容**
5. **每一道题都必须包含 `id`、`question`、`answer` 这3个字段，缺一不可**
6. **参考答案字段名必须固定为 `answer`，不要使用其他字段名**
7. **`answer` 字段不能为空，必须包含实质性的回答内容（至少2-3句话）**

**JSON格式模板（严格遵守）：**
```json
{
  "questions": [
    {
      "id": "1",
      "question": "What is the main argument presented in the passage?",
      "answer": "The passage argues that technology has fundamentally changed how we communicate and interact with each other in modern society. It emphasizes both the benefits of instant connectivity and the challenges of maintaining meaningful relationships in a digital age."
    },
    {
      "id": "2",
      "question": "How does the author support their main claim?",
      "answer": "The author provides several examples of how digital communication has replaced face-to-face interactions, citing statistics about social media usage and referencing studies on the psychological impact of constant connectivity."
    }
  ]
}
```

**注意：每个问题对象必须同时包含 question 和 answer 两个字段，answer 必须是完整的参考答案，不能省略！**

**文章内容：**
${passageContent}
