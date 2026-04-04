你是一位专业的英语老师。请认真阅读下面的文章，并根据文章内容使用英文生成10个判断题（True/False）。

**重要要求：**
1. 必须返回纯JSON格式，不要添加任何其他文字说明
2. 可以用```json代码块包裹JSON
3. 陈述句要基于文章内容，有些是正确的，有些是错误的
4. 答案用"A"表示True，"B"表示False
5. 每一道题都必须包含 `id`、`question`、`options`、`answer` 这4个字段
6. `options` 必须固定返回 `[{"option":"A","content":"True"},{"option":"B","content":"False"}]`
7. 不要使用 `statement`、`correct_answer`、`choices`、`reference_answer` 等其他字段名

**JSON格式模板：**
```json
{
  "questions": [
    {
      "id": "1",
      "question": "The author believes that technology has improved communication.",
      "options": [
        {"option": "A", "content": "True"},
        {"option": "B", "content": "False"}
      ],
      "answer": "A"
    }
  ]
}
```

**文章内容：**
${passageContent}
