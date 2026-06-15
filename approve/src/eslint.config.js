//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  // 构建产物 / 生成目录不参与 lint（否则 .output 下的打包 js 会因不在 tsconfig 报 parsing error）。
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.output/**',
      '.nitro/**',
      '.tanstack/**',
      'dist/**',
    ],
  },
  ...tanstackConfig,
  // 只注册经典两条 React Hooks 规则（不引入 v7 的 React Compiler 规则集）；
  // 代码里已有的 eslint-disable react-hooks/exhaustive-deps 注释依赖本插件注册。
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
]
