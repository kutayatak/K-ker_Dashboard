# K-ker Dashboard

K-ker Dashboard, görev yönetimi, araç takibi ve operasyonel süreçleri yönetmek için tasarlanmış modern bir web uygulamasıdır.

## Kurulum ve Çalıştırma

Gereksinimler:
- Node.js 24+
- pnpm 10+
- PostgreSQL Veritabanı (örn. Neon, Supabase)

### Adımlar:
1. Depoyu klonlayın ve klasöre girin: `cd K-ker_Dashboard`
2. Bağımlılıkları yükleyin: `pnpm install`
3. Çevre değişkenlerini kopyalayın: `.env.example` dosyasını `.env` olarak çoğaltın ve `DATABASE_URL` değerini ayarlayın.
4. Geliştirme sunucusunu başlatın:
   - API: `pnpm --filter @workspace/api-server run dev` (Port 5000)
   - Frontend: `pnpm --filter @workspace/dispatch-dashboard run dev` (Port 5173)

### Diğer Komutlar
- `pnpm run typecheck` — Tüm paketlerde tip kontrolü yapar.
- `pnpm run build` — Uygulamayı üretime hazırlar.
- `pnpm run test` — Testleri (Vitest) çalıştırır.

## Teknoloji Yığını

- **Çalışma Alanı:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend (`apps/dispatch-dashboard`):** React, Vite, TailwindCSS, Radix UI, React Query, Wouter.
- **Backend (`apps/api-server`):** Express 5, Drizzle ORM, Zod, helmet.
- **Dağıtım:** Vercel (Serverless Functions).

## Mimari Kararlar

1. **Monorepo Yaklaşımı:** Frontend, backend ve ortak paylaşılan tiplerin (Zod/Drizzle şemaları) tek bir repoda yönetilmesi.
2. **Serverless Backend:** Express API, Vercel üzerinde `api/index.js` aracılığıyla serverless fonksiyon olarak çalıştırılır. Bu yüzden Vercel deploylarında `outputDirectory` olarak frontend'in build dizini, API istekleri için ise backend modülü yönlendirilir.
3. **Güvenlik ve Performans:** Frontend PWA (Progressive Web App) desteği ile asenkron (lazy) sayfa yüklemelerine sahiptir. Backend ise global hata yönetimi (Error Handler) ve oran sınırlayıcı (Rate Limiting) gibi savunma katmanlarıyla desteklenmiştir.

## Pointers

- See the `pnpm-workspace.yaml` for workspace configuration.
