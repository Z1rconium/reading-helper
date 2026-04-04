你是一位专业的英语老师。请认真阅读这篇文章，并根据文章内容使用英文生成10个多项选择题及参考答案。

**重要要求：**
1. 必须返回纯JSON格式，不要添加任何其他文字说明
2. 可以用```json代码块包裹JSON
3. 每个选择题必须有4个选项（A、B、C、D）
4. 题目要基于文章内容，难度适中

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

文章内容：
"${passageContent}"