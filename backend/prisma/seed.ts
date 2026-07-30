import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const cloudflareVideoUid =
    process.env.DEMO_CLOUDFLARE_VIDEO_UID || 'demo-video-uid';

  const series = await prisma.series.upsert({
    where: { slug: 'default-series' },
    update: {
      status: 'ACTIVE',
    },
    create: {
      title: '默认系列',
      description: '用于本地开发和视频归类。',
      slug: 'default-series',
      status: 'ACTIVE',
      sortOrder: 0,
    },
  });

  await prisma.video.upsert({
    where: { id: 1 },
    update: {
      seriesId: series.id,
      cloudflareVideoUid,
      priceCents: 300,
      priceCredits: 280,
      currency: 'XTR',
      status: 'ACTIVE',
    },
    create: {
      seriesId: series.id,
      title: '示例私密视频',
      description: '用于本地开发和播放器水印调试。',
      cloudflareVideoUid,
      priceCents: 300,
      priceCredits: 280,
      currency: 'XTR',
      status: 'ACTIVE',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
