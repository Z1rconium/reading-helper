请精确分析以下英语句子的语法结构，用JSON格式返回以下内容:
1. 对句子进行成分标注（只标注以下成分）:
   - 主语(Subject)
   - 谓语(Predicate)
   - 宾语(Object)
   - 直接宾语(Direct Object)
   - 间接宾语(Indirect Object)
   - 主语补语(Subject Complement)
   - 宾语补语(Object Complement)
   - 定语(Attributive)
   - 状语(Adverbial)
   - 同位语(Appositive)
   - 主语从句(Subject Clause)
   - 宾语从句(Object Clause)
   - 表语从句(Predicative  Clause)
   - 同位语从句(Appositive Clause)
   - 定语从句(Attributive Clause)
   - 状语从句(Adverbial Clause)
2. 生成语法树结构（Syntax tree）

要求:
- 只标注上述成分，其他成分不标注
- 语法树要体现上述成分的层次关系
- 分析结果要专业准确

句子: "${currentSelection}"

返回格式示例:
{
    "components": [
        {"text": "The teacher", "type": "subject"},
        {"text": "who taught us English", "type": "attributive-clause"},
        {"text": "gave", "type": "predicate"},
        {"text": "me", "type": "indirect-object"},
        {"text": "a book", "type": "direct-object"},
        {"text": "to read", "type": "attributive"},
        {"text": "which I found very interesting", "type": "attributive-clause"}
    ],
    "syntax_tree": {
        "label": "Sentence",
        "type": "sentence",
        "children": [
            {
                "label": "The teacher who taught us English",
                "type": "subject",
                "children": [...]
            },
            {
                "label": "gave",
                "type": "predicate",
                "children": [...]
            },
            ...
        ]
    },
}