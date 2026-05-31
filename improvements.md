# K-ker Dashboard - Uygulama İncelemesi ve Optimizasyon Önerileri

Mevcut kod tabanı detaylıca incelenmiş ve daha önce hazırlanan önerilerin bir kısmının başarıyla hayata geçirildiği (klasör yapısının `apps/` olarak düzenlenmesi, router lazy loading, backend rate limiting & helmet entegrasyonu vb.) görülmüştür.

Mevcut yapıyı çok daha yüksek performanslı, ölçeklenebilir ve temiz hale getirmek için **güncel ve somut** iyileştirme alanları aşağıda listelenmiştir.

---

## 1. Kritik Performans Optimizasyonları (Veritabanı ve N+1 Problemleri)

### A. Görev Listeleme Endpoint'indeki N+1 Sorgu Problemi (`GET /tasks`)
*   **Mevcut Durum (`apps/api-server/src/routes/tasks.ts`):** 
    Görevler listelenirken her bir görev için `enrichTask` fonksiyonu tetiklenmekte ve eğer görevde atanmış bir araç varsa her seferinde veritabanına tekil bir `SELECT` sorgusu atılmaktadır. 50 görev olan bir günde bu 50+1 veritabanı sorgusu anlamına gelir ve dashboard'un en sık istek attığı endpoint'te ciddi yavaşlığa yol açar.
*   **Öneri (Çözüm):** 
    Drizzle ORM'in `.leftJoin()` yapısı kullanılarak görevler ve araçlar tek bir SQL sorgusunda birleştirilmelidir:
    ```typescript
    const tasks = await db
      .select({
        task: tasksTable,
        vehicleName: vehiclesTable.name,
        driverName: vehiclesTable.driverName,
      })
      .from(tasksTable)
      .leftJoin(vehiclesTable, eq(tasksTable.vehicleId, vehiclesTable.id))
      .where(conditions.length ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined);
    ```

### B. Excel İndirme Endpoint'indeki N+1 Sorgu Problemi (`GET /excel/download`)
*   **Mevcut Durum (`apps/api-server/src/routes/excel.ts`):**
    Excel çıktısı üretilirken, o güne ait tüm görevlerdeki araçların plakalarını çözmek için döngü (`for (const id of vehicleIds)`) içerisinde tekil `db.select()` sorguları çalıştırılmaktadır.
*   **Öneri (Çözüm):**
    Plakalar çekilmeden önce benzersiz araç ID'leri toplanıp Drizzle `inArray` operatörü ile tek seferde toplu olarak çekilmeli ve bellek üzerinde eşleştirilmelidir:
    ```typescript
    if (vehicleIds.length > 0) {
      const vehicles = await db
        .select({ id: vehiclesTable.id, plate: vehiclesTable.plate })
        .from(vehiclesTable)
        .where(inArray(vehiclesTable.id, vehicleIds));
      for (const v of vehicles) {
        vehicleMap.set(v.id, v.plate);
      }
    }
    ```

---

## 2. Kod Yapısı ve Modülerlik (Frontend)

### A. Devasa Bileşen Dosyası (`board.tsx`)
*   **Mevcut Durum:** `apps/dispatch-dashboard/src/pages/board.tsx` dosyası yaklaşık **1730 satır** ve **74KB** büyüklüğündedir. Bu büyüklük kodun okunabilirliğini, bakımını ve test edilebilirliğini zorlaştırmaktadır.
*   **Öneri:**
    *   **Bileşen Bölme (Component Splitting):** `TaskCard`, `TaskColumn`, `QueueList` gibi iç bileşenler kendi bağımsız dosyalarına (örn: `components/board/TaskCard.tsx`) taşınmalıdır.
    *   **İş Mantığının Soyutlanması (Custom Hooks):** Sürükle-bırak (drag-drop) mantığı, Excel indirme, WhatsApp bildirim gönderme ve uçuş durum kontrolü gibi state ve mutasyon yönetimleri özel React hook'larına (örn: `useBoardActions.ts`) aktarılarak UI kodu sadeleştirilebilir.

### B. Sanallaştırılmış Liste (Virtualized List) Desteği
*   **Mevcut Durum:** Yoğun günlerde yüzlerce görev veya kuyrukta çok sayıda araç listelendiğinde DOM elementlerinin sayısı artarak arayüzde kasmaya yol açabilir.
*   **Öneri:** `react-window` veya `@tanstack/react-virtual` kullanılarak sadece ekranda görünen kartların render edilmesi sağlanabilir.

---

## 3. Altyapı ve Canlı Ortam Hazırlığı (DevOps & Backend)

### A. PostgreSQL Serverless Bağlantı Havuzlaması (Connection Pooling)
*   **Mevcut Durum:** Projede Drizzle ve PostgreSQL kullanılmaktadır. Sunucu Vercel üzerinde çalıştığı için her istek yeni bir serverless fonksiyon ayağa kaldırabilir. Bu durum veritabanı bağlantı limitlerinin (Neon Postgres vb.) çok hızlı tüketilmesine neden olur.
*   **Öneri:** Veritabanı bağlantı string'i olarak Neon/Supabase'in sunduğu **PgBouncer** havuzlanmış bağlantı portu/adresi kullanılmalıdır ve Drizzle yapılandırması buna göre optimize edilmelidir.

### B. Otomatik Migrasyon Altyapısı (Migration Strategy)
*   **Mevcut Durum:** Geliştirme aşamasında şema güncellemeleri için `drizzle-kit push` komutu kullanılmaktadır.
*   **Öneri:** Canlı (Production) ortamın veri kaybı yaşamaması ve stabil çalışması için Drizzle migrations yapısına (`drizzle-kit generate` ve `drizzle-kit migrate`) geçiş kurgulanmalıdır. CI/CD hattına otomatik migrasyon adımları eklenmelidir.

---

## 4. Gerçekleştirilen / Zaten Devreye Alınan İyileştirmeler

Analiz sırasında aşağıdaki maddelerin zaten çok iyi bir şekilde çözüldüğü görülmüştür:
1.  **Klasör Yapısı:** Kafa karıştırıcı olan `artifacts/` klasörleri düzeltilmiş, `apps/` (api-server, dispatch-dashboard) ve `lib/` (ortak kütüphaneler) olarak temiz bir monorepo standardına kavuşturulmuştur.
2.  **Güvenlik:** Express backend sunucusunda `helmet` ile HTTP başlık güvenliği ve `express-rate-limit` ile API hız sınırlandırılması yapılmıştır.
3.  **Hata Yönetimi:** Backend'de `errorHandler` middleware'i ile global hata yakalama ve frontend'de `ErrorBoundary` kurgulanmıştır.
4.  **Route Lazy Loading:** Sayfaların tamamı Vite ve React `lazy` / `Suspense` kullanılarak asenkron yüklenecek şekilde tasarlanmıştır.
