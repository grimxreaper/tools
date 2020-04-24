# `index.test.ts`

**DO NOT MODIFY**. This file has been autogenerated. Run `rome test packages/@romejs/js-parser/index.test.ts --update-snapshots` to update.

## `esprima > es2015-yield > invalid-yield-generator-arrow-parameters`

```javascript
Program {
  comments: Array []
  corrupt: true
  directives: Array []
  filename: 'input.js'
  hasHoistedVars: false
  interpreter: undefined
  mtime: undefined
  sourceType: 'script'
  syntax: Array []
  loc: Object {
    filename: 'input.js'
    end: Object {
      column: 0
      index: 40
      line: 2
    }
    start: Object {
      column: 0
      index: 0
      line: 1
    }
  }
  diagnostics: Array [
    Object {
      origins: Array [Object {category: 'js-parser'}]
      description: Object {
        category: 'parse/js'
        message: PARTIAL_BLESSED_DIAGNOSTIC_MESSAGE {value: 'yield is not allowed in generator parameters'}
      }
      location: Object {
        filename: 'input.js'
        mtime: undefined
        sourceType: 'script'
        end: Object {
          column: 30
          index: 30
          line: 1
        }
        start: Object {
          column: 30
          index: 30
          line: 1
        }
      }
    }
  ]
  body: Array [
    FunctionDeclaration {
      id: BindingIdentifier {
        name: 'g'
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 11
            index: 11
            line: 1
          }
          start: Object {
            column: 10
            index: 10
            line: 1
          }
        }
      }
      loc: Object {
        filename: 'input.js'
        end: Object {
          column: 39
          index: 39
          line: 1
        }
        start: Object {
          column: 0
          index: 0
          line: 1
        }
      }
      head: FunctionHead {
        async: false
        generator: true
        hasHoistedVars: false
        params: Array []
        predicate: undefined
        rest: undefined
        returnType: undefined
        thisType: undefined
        typeParameters: undefined
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 13
            index: 13
            line: 1
          }
          start: Object {
            column: 11
            index: 11
            line: 1
          }
        }
      }
      body: BlockStatement {
        directives: Array []
        loc: Object {
          filename: 'input.js'
          end: Object {
            column: 39
            index: 39
            line: 1
          }
          start: Object {
            column: 13
            index: 13
            line: 1
          }
        }
        body: Array [
          ExpressionStatement {
            loc: Object {
              filename: 'input.js'
              end: Object {
                column: 37
                index: 37
                line: 1
              }
              start: Object {
                column: 15
                index: 15
                line: 1
              }
            }
            expression: ArrowFunctionExpression {
              loc: Object {
                filename: 'input.js'
                end: Object {
                  column: 37
                  index: 37
                  line: 1
                }
                start: Object {
                  column: 15
                  index: 15
                  line: 1
                }
              }
              body: NumericLiteral {
                value: 42
                format: undefined
                loc: Object {
                  filename: 'input.js'
                  end: Object {
                    column: 37
                    index: 37
                    line: 1
                  }
                  start: Object {
                    column: 35
                    index: 35
                    line: 1
                  }
                }
              }
              head: FunctionHead {
                async: false
                hasHoistedVars: false
                predicate: undefined
                rest: undefined
                returnType: undefined
                thisType: undefined
                loc: Object {
                  filename: 'input.js'
                  end: Object {
                    column: 35
                    index: 35
                    line: 1
                  }
                  start: Object {
                    column: 15
                    index: 15
                    line: 1
                  }
                }
                params: Array [
                  BindingIdentifier {
                    name: 'a'
                    loc: Object {
                      filename: 'input.js'
                      end: Object {
                        column: 17
                        index: 17
                        line: 1
                      }
                      start: Object {
                        column: 16
                        index: 16
                        line: 1
                      }
                    }
                  }
                  BindingIdentifier {
                    name: 'b'
                    loc: Object {
                      filename: 'input.js'
                      end: Object {
                        column: 20
                        index: 20
                        line: 1
                      }
                      start: Object {
                        column: 19
                        index: 19
                        line: 1
                      }
                    }
                  }
                  BindingIdentifier {
                    name: 'c'
                    loc: Object {
                      filename: 'input.js'
                      end: Object {
                        column: 23
                        index: 23
                        line: 1
                      }
                      start: Object {
                        column: 22
                        index: 22
                        line: 1
                      }
                    }
                  }
                  BindingIdentifier {
                    name: 'INVALID_PLACEHOLDER'
                    loc: Object {
                      filename: 'input.js'
                      end: Object {
                        column: 34
                        index: 34
                        line: 1
                      }
                      start: Object {
                        column: 35
                        index: 35
                        line: 1
                      }
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    }
  ]
}
```