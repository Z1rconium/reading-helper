你是一位专业的英语老师。请认真阅读下面的文章，并根据文章内容使用英文生成10个判断题（True/False）。

**重要要求：**
1. 必须返回纯JSON格式，不要添加任何其他文字说明
2. 可以用```json代码块包裹JSON
3. 顶层必须是一个对象，且必须只包含 `questions` 这一个字段
4. `questions` 必须是长度为10的数组
5. 每一道题都必须包含且只包含 `id`、`question`、`options`、`answer` 这4个字段
6. `id` 必须是字符串数字，从"1"到"10"，按顺序递增
7. `question` 必须是英文陈述句，不能为空，基于文章内容，有些正确有些错误
8. `options` 必须固定为 `[{"option":"A","content":"True"},{"option":"B","content":"False"}]`
9. `answer` 必须是字符串"A"（表示True）或"B"（表示False），不能为空
10. 不要使用 `statement`、`correct_answer`、`choices`、`reference_answer`、`explanation` 等其他字段名
11. 不要输出 Markdown 标题、注释、解释、前后缀文字；只输出最终JSON

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
    },
    {
      "id": "2",
      "question": "The passage mentions that social media reduces face-to-face interaction.",
      "options": [
        {"option": "A", "content": "True"},
        {"option": "B", "content": "False"}
      ],
      "answer": "B"
    }
  ]
}
```

**文章内容：**
${passageContent}
