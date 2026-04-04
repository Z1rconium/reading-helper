你是一位专业的英语老师。请认真阅读下面的文章，并根据文章内容使用英文生成10个多项选择题及参考答案。

**重要要求：**
1. 必须返回纯JSON格式，不要添加任何其他文字说明
2. 可以用```json代码块包裹JSON
3. 每个选择题必须有4个选项（A、B、C、D）
4. 题目要基于文章内容，难度适中
5. 每一道题都必须包含 `id`、`question`、`options`、`answer` 这4个字段
6. `options` 必须是长度为4的数组，每项格式固定为 `{"option":"A","content":"..."}` 这种形式
7. `answer` 必须是正确选项字母，只能是 `A`、`B`、`C` 或 `D`
8. 不要使用 `choices`、`correct_answer`、`correctOption` 等其他字段名

**JSON格式模板：**
```json
{
  "questions": [
    {
      "id": "1",
      "question": "What is the main topic of the passage?",
      "options": [
        {"option": "A", "content": "The history of technology"},
        {"option": "B", "content": "Modern education systems"},
        {"option": "C", "content": "Environmental protection"},
        {"option": "D", "content": "Economic development"}
      ],
      "answer": "A"
    }
  ]
}
```

**文章内容：**
${passageContent}
