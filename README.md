# 🚀 K-ker Dispatcher Dashboard

K-ker Dashboard; lojistik sevkiyat planlaması, gerçek zamanlı araç koordinasyonu, çift yönlü akıllı Excel entegrasyonu, taktil mobil arayüz tasarımı ve gelişmiş finansal/operasyonel raporlama süreçlerini uçtan uca yönetmek amacıyla geliştirilmiş, **monorepo** mimarisine sahip üst düzey bir kurumsal yönetim platformudur.

Platform, yüksek trafikli operasyonlarda dispatcher'ların işlerini kolaylaştırmak ve sıfır hata ile sevkiyat yönetimi yapabilmelerini sağlamak için modern web teknolojileri ve premium UI/UX prensipleriyle tasarlanmıştır.

---

## 🏗️ Monorepo Mimarisi ve Teknoloji Yığını

Sistem, maksimum kod paylaşımı, derleme zamanı tam tip güvenliği (full-stack type-safety) ve bağımsız paket yönetimi sağlamak amacıyla **pnpm workspaces** altyapısıyla yapılandırılmıştır.

```mermaid
graph TD
    subgraph apps [Uygulamalar - apps/]
        D["dispatch-dashboard (React + Vite + Radix UI + Tailwind)"]
        S["api-server (Express 5 + Drizzle ORM)"]
    end
    subgraph libs [Kütüphaneler & Paketler - lib/]
        DB["db (PostgreSQL Schema + Drizzle Migrations)"]
        ZOD["api-zod (Otomatik Üretilen Zod Şemaları)"]
        CLIENT["api-client-react (Otomatik Üretilen TanStack Query Hooks)"]
        SPEC["api-spec (OpenAPI 3.1 Spec + Orval Yapılandırması)"]
    end

    %% İlişkiler
    D --> CLIENT
    CLIENT --> ZOD
    S --> ZOD
    S --> DB
    SPEC --> CLIENT
    SPEC --> ZOD
```

### Proje Paket Yapısı:
* **`apps/dispatch-dashboard`**: Sevkiyat planlama, taktil kanban panosu, dinamik grafikler ve mobil öncelikli arayüzleri içeren React + Vite ön yüz uygulaması.
* **`apps/api-server`**: Express 5 tabanlı, Drizzle ORM kullanan, asenkron yapıda çalışan ve Vercel Serverless Functions ile uyumlu arka yüz API sunucusu.
* **`lib/db`**: PostgreSQL veritabanı şemaları, tablo ilişkileri ve Drizzle kit göç (migration) yönetimi.
* **`lib/api-spec`**: API kontratını tek bir merkezde toplayan OpenAPI 3.1 (`openapi.yaml`) şartnamesi ve `orval` kod oluşturma motoru.
* **`lib/api-zod`**: OpenAPI kontratından otomatik üretilen ve hem sunucu hem de istemci tarafında veri doğrulamada kullanılan Zod modelleri.
* **`lib/api-client-react`**: OpenAPI kontratından otomatik türetilen, asenkron veri senkronizasyonu sağlayan TanStack (React) Query kütüphanesi.

---

## ✨ Öne Çıkan Gelişmiş Özellikler ve Çözümler

> [!NOTE]
> Projede uygulanan her bir özellik, saha dispatcher'larının pratik ihtiyaçları ve kullanıcı alışkanlıkları göz önünde bulundurularak "Premium UX/UI" standartlarında sıfırdan hayata geçirilmiştir.

### 1. 📊 5 Kolonlu Kanban Panosu (`board.tsx`)
* **5-Grid Masaüstü Düzeni:** İşler durumlarına göre **Gelir (Havalimanı Karşılama), Gider (Otel Sevkleri), Teknik İşler, Tamamlandı ve İptaller** olmak üzere 5 kolonlu esnek bir grid yapısında listelenir.
* **Dinamik Kart Tasarımları:** Otel Alımı, Havalimanı Karşılama, Ekstra İşler ve Teknik İşler için özel renk kodlu kenarlıklar, canlı uçuş takibi (rölanti/rötarlı) ve WhatsApp bildirim durum göstergeleri.
* **Taktil Mikro Etkileşimler:** Aydınlık ve karanlık mod ile tam uyumlu soft gölgeler, hover durumunda yukarı süzülme (`-translate-y-[2px]`) ve tıklama anında bükülme (`active:scale-[0.98]`) efektleri.

### 2. 📱 Premium Mobil Arayüz & iOS Tarzı Deneyim
Saha operasyonlarının %90 oranında mobil cihazlar üzerinden yönetildiği dikkate alınarak tasarlanmış benzersiz bir mobil deneyim:
* **iOS Tarzı Bottom Sheets (Alt Çekmeceler):** Araç Ekle, Araç Ata, Görev Düzenle ve WhatsApp Bildirim panelleri mobil görünümde ekranın altından yukarı süzülen, parmak dostu sürükleme barına (drag handle) sahip bottom sheet yapısına dönüştürülmüştür.
* **Dashed "+ Araç Seç" Butonu:** Sürükle-bırak yapılamayan mobil ekranlarda, araç atanmamış kartların üzerinde beliren dashed buton sayesinde tek dokunuşla araç atama çekmecesi açılır.
* **Tek Dokunuş Hızlı İşlemler:** Mobil kartların altında yer alan hızlı işlem çubuğu ile sevkler tek tıkla **"Tamamlandı"** yeşil butonuna veya **"İptal"** kırmızı butonuna basılarak sevk edilebilir.
* **WhatsApp Bildirim Nabzı (Pulsing Badges):** Mobil sekme çubuğunda, araç atanmış fakat şoföre WhatsApp bildirimi gönderilmemiş bekleyen işler olduğunda yeşil renkte yanıp sönen dinamik bir bildirim noktası yer alır.

### 3. ⚙️ Teknik İşler Yönetimi & Regex Masraf Kodu Çözümü
* **Otomatik Ayrıştırma:** Excel içe aktarımında veya sevk oluşturma sırasında açıklama/not alanında `"teknik"`, `"masraf"`, `"msrf"`, `"kod"` gibi ibareler geçen işler otomatik olarak `"technical"` tipine dönüştürülür ve teknik işler havuzuna alınır.
* **Regex Masraf Kodu Çözücü:** Görev içeriklerinden `MSRF-XXXX` (Örn: `MSRF-4912`) yapısındaki masraf kodlarını regex kullanarak otomatik ayıklar ve veritabanında ayrı bir alanda saklar.
* **Excel'de Sarı Renk Biçimlendirmesi:** Gün sonu Excel çıktısı indirilirken, teknik işlerin yer aldığı satırlar otomatik olarak **Sarı** (`fgColor: { rgb: "FFFF00" }`) dolgu rengiyle boyanarak geleneksel dispatcher alışkanlıklarıyla tam uyum sağlanır.

### 📈 4. Raporlar & Gelişmiş Analitik Paneli (`reports.tsx`)
Geçmiş günlerdeki tüm verileri analiz etmek için geliştirilmiş zengin analitik ekranı:
* **Dinamik KPI Kartları:** Toplam Yapılan Kilometre (KM), Sefer Başına Ortalama KM, Filoda En Çok İş Yapan Araç ve İptal Edilen İş Oranı.
* **Haftalık KM Dağılım Grafiği:** Son 7 günde yapılan toplam mesafeleri aydınlık/karanlık mod uyumlu dikey çubuk grafikle gösterir.
* **Sefer Tipleri Dağılım Oranları:** Havalimanı (Gelir), Otel (Gider), Ekstra ve Teknik işlerin toplam sevk oranlarını yatay stacked bar formatında sunar.
* **En Aktif Araçlar Lider Tablosu:** Şoför ismi, plaka, tamamlanan sefer sayısı ve toplam KM bilgileriyle en üretken 5 aracı listeler.
* **BOM Destekli Türkçe Excel/CSV Çıktısı:** Teknik iş raporları listesinden seçilen aya göre filtrelenen veriler tek tıkla CSV olarak indirilir. Excel'in Türkçe karakterleri bozmasını engellemek için dosya başına **UTF-8 BOM** (`[0xEF, 0xBB, 0xBF]`) baytları eklenmiştir.

### 5. 📁 Akıllı Excel İçe/Dışa Aktarım Mantığı
* **İptal Satır Yönetimi:** Gelen Excel listesinde plaka hücresinde `"İPTAL"` yazan işler veritabanına silinmeden `status = "cancelled"` (soft-cancel) olarak kaydedilir. Daha sonra bu sevkler için plaka güncellenirse, kartlar otomatik olarak aktif konuma getirilir.
* **Çift Yönlü Senkronizasyon:** Sistemde araç ataması yapılan ve kilometreleri (KM) güncellenen görevler, gün sonu Excel'i indirildiğinde tam olarak doğru koordinatlara (plaka ve KM sütunlarına) yazılır.

---

## 🛠️ Kurulum ve Geliştirme Ortamı Hazırlığı

### Önkoşullar:
* **Node.js**: `v24.x` veya üzeri
* **pnpm**: `v10.x` veya üzeri
* **PostgreSQL**: Sürüm `15+` (Supabase, Neon veya Lokal PostgreSQL)

### 1. Depoyu Klonlayın ve Bağımlılıkları Kurun
```bash
git clone https://github.com/kutayatak/K-ker_Dashboard.git
cd K-ker_Dashboard
pnpm install
```

### 2. Çevre Değişkenlerini Yapılandırın
Monorepo kök dizininde bir `.env` dosyası oluşturun ve PostgreSQL veritabanı adresinizi girin:
```env
DATABASE_URL="postgresql://kullanici_adi:sifre@host:5432/veritabani?sslmode=require"
```

### 3. Veritabanı Şemasını Eşleyin
Drizzle ORM şemalarını veritabanınıza push edin:
```bash
npx pnpm --filter @workspace/db run push
```

### 4. Geliştirme Sunucusunu Başlatın
Arka yüz API sunucusunu ve ön yüz dashboard uygulamasını eşzamanlı olarak geliştirme modunda çalıştırın:
```bash
npx pnpm run dev
```
* 🖥️ **Dispatch Dashboard**: [http://localhost:5173](http://localhost:5173)
* ⚙️ **API Sunucusu**: [http://localhost:5000](http://localhost:5000)

---

## ⚙️ Monorepo Komut Kılavuzu

Proje kök dizininde çalıştırabileceğiniz temel pnpm workspace komutları:

| Komut | Açıklama |
| :--- | :--- |
| `npx pnpm run dev` | API sunucusunu ve Dashboard uygulamasını paralel olarak lokalde çalıştırır. |
| `npx pnpm run build` | Canlı ortam (production) dağıtımı için tüm paketleri optimize edilmiş şekilde derler. |
| `npx pnpm run typecheck` | Monorepo genelindeki tüm TypeScript dosyalarında statik tip kontrolü yapar. |
| `npx pnpm --filter "@workspace/api-spec" run codegen` | `openapi.yaml` dosyasından istemci kodlarını, Zod şemalarını ve React Query kancalarını otomatik üretir. |
| `npx pnpm --filter @workspace/db run generate` | Drizzle şemalarındaki değişiklikler için yeni bir SQL migration dosyası oluşturur. |
| `npx pnpm --filter @workspace/db run push` | Şemayı doğrudan veritabanına uygulayarak tabloları senkronize eder. |

---

## 🚀 Canlı Ortam Dağıtımı (Deployment)

Proje, **Vercel** platformu üzerinde sıfır konfigürasyonla ve yüksek performansla dağıtılabilecek şekilde tasarlanmıştır:
1. **API Server Dağıtımı:** Vercel Serverless Functions yapısıyla tam uyumludur. Express yönlendiricisi kökteki `api/index.js` üzerinden istekleri karşılar.
2. **Dashboard Dağıtımı:** Vite tarafından derlenen statik HTML/JS/CSS dosyaları Vercel CDN üzerinde en hızlı şekilde istemciye ulaştırılır.
3. **Database Bağlantısı:** Veritabanı bağlantı havuzu (connection pooling) kullanılarak sunucusuz mimarinin getirdiği eş zamanlı veritabanı limitleri optimize edilmiştir.
