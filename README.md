This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AI 自动排版队列（Redis + BullMQ）

公开发布且选择 **AI 自动排版** 时，排版任务会进入 Redis 队列，由**独立进程**消费，避免占用 `next start` 进程导致 `save-draft` / `update-structure` 长时间 `pending`。

1. 安装并启动 Redis（示例本机）  
2. 配置环境变量 `REDIS_URL`（例：`redis://127.0.0.1:6379`）  
3. 启动 Web：`npm run start`  
4. 另开终端启动 worker（在 `apps/web` 目录）：

```bash
export REDIS_URL=redis://127.0.0.1:6379
npm run worker:ai-reflow
```

生产环境建议用 `tmux` / `pm2` / `systemd` 常驻 worker。
