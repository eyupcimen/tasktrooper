# Oturum Günlüğü — TaskTrooper kişisel sürüm

Yeni bir oturum bu dosyayı okuyarak kaldığı yerden devam edebilsin diye yazıldı.
Son güncelleme: 2026-10-08.

## 1. Bu repo ne, nasıl kullanılıyor

- Kaynak: `github.com/makifbaysal/tasktrooper` (Go backend + Electron + React).
- Bu klasör (`~/Developer/tasktrooper`) kullanıcının **kişisel sürümü**. Kullanıcı istedi:
  **commit yok, push yok, PR yok.** Tüm değişiklikler çalışma ağacında (`git status`).
- Asıl kullanılan uygulama: `/Applications/TaskTrooper.app` = bu klasörden derlenen sürüm.
  Görünen adı **"TaskTrooper Eyüp"**.
- Orijinal Homebrew sürümünün yedeği: `~/Developer/TaskTrooper-original.app`.
- Panodaki proje: **Victus** (Flutter, `github.com/eyupcimen/victus`, yerel kopya `~/Developer/Victus`).
  Repo id: `b66ef0d0-7c90-44d3-8f7b-e42eb429a65d`.
- Kullanıcı Türkçe konuşuyor, ADHD-dostu kısa cevap istiyor.

## 2. Derleme ve kurulum (her değişiklikten sonra)

```sh
cd ~/Developer/tasktrooper/desktop
npm run build:server:universal   # sadece server/ değiştiyse
npm run build                    # sadece desktop/src (Electron) değiştiyse
npm run build:ui                 # desktop/ui değiştiyse
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir -c.mac.identity=- --publish never
```

Kurulum:

1. Çalışan ajan var mı bak: `pgrep -fl "claude -p"`. Varsa bitmesini bekle (en fazla 10 dk).
2. `osascript -e 'quit app "TaskTrooper"'` ve sürecin kapanmasını bekle.
3. `rm -rf /Applications/TaskTrooper.app`
4. `ditto desktop/release/mac-arm64/TaskTrooper.app ~/Developer/TaskTrooper-custom.app`
   ve ardından `mv ~/Developer/TaskTrooper-custom.app /Applications/TaskTrooper.app`
5. `open -a /Applications/TaskTrooper.app`

Tuzaklar:

- **İmza:** Keychain'de aynı "Apple Development" sertifikasından iki tane var. Otomatik
  imzalama "ambiguous" hatası verir. Bu yüzden `-c.mac.identity=-` (ad-hoc) kullanılıyor.
- **Keychain izni:** Her yeni ad-hoc imzada macOS "TaskTrooper Safe Storage" için izin
  sorar. Kullanıcı "Always Allow" diyene kadar uygulama açılışta **takılı görünür**
  (backend başlamaz). Bu normal.
- **/Applications'a doğrudan `ditto` yapma:** "App Management" izni yüzünden yarım kopya
  kalır. Önce başka yere kopyala, sonra `mv` ile taşı.
- **`productName` / `CFBundleName` değiştirme.** `CFBundleName` değişince Electron
  "Unable to find helper app" ile çöker. `productName` değişince veri klasörü
  (`~/Library/Application Support/TaskTrooper`) ve keychain kaydı değişir, veri kaybolur.
  Görünen ad sadece `CFBundleDisplayName` + pencere başlığı + kenar çubuğu ile değişiyor.
- Kendi derlenen sürüm otomatik güncelleme yapmaz (`publish: null`), resmi güncelleme
  değişiklikleri ezmez.
- `desktop/src/main/services/detect.test.ts` içindeki "xcode-clt ... Windows or Linux"
  testi bu makinede 5 sn timeout ile düşüyor. Değişikliklerle ilgisi yok.

## 3. Çalışan uygulamanın API'sine erişim (teşhis için)

Backend rastgele portta dinliyor, token ortam değişkeninde:

```sh
A=$(pgrep -f "Resources/bin/agent-server")
K=$(ps eww -o command= -p $A | tr ' ' '\n' | sed -n 's/^SERVER_API_KEY=//p')
P=$(lsof -nP -iTCP -sTCP:LISTEN -a -p $A | awk 'NR==2{split($9,a,":");print a[2]}')
curl -s -H "Authorization: Bearer $K" "http://127.0.0.1:$P/v1/repositories/<repoId>/tasks"
```

- Token'ı ekrana basma.
- Gömülü Postgres'e koddaki sabit şifreyle (`local_llm` / `local_llm_desktop`)
  **bağlanılamadı**. DB yerine API kullan.
- Ajan konuşma dökümleri: `~/.claude/projects/*task-<taskId>*/*.jsonl`.
- Görev çalışma kopyaları: `~/Library/Application Support/TaskTrooper/data/workspaces/task-<id>`.

## 4. Eklenen özellikler (hepsi commit edilmemiş)

| Özellik | Dosyalar |
|---|---|
| Analiz Review / Human UAT kartında **Onayla** butonu (görevi `done`'a taşır) | `ui/src/pages/BoardPage.tsx` |
| Panonun üstünde **"Onayını bekleyenler"** şeridi | `ui/src/components/board/AwaitingYouStrip.tsx` |
| Üst çubukta açık **"Product Manager"** etiketi (önce sadece "PM'den iste…" kutusuydu) | `ui/src/components/layout/LeadQuickAsk.tsx`, `locales/*/frame.ts` |
| Görünen ad "TaskTrooper Eyüp" | `desktop/electron-builder.yml` (CFBundleDisplayName), `src/main/window.ts`, `ui/index.html`, `SidebarBrand.tsx` |
| **CSV/Excel içe aktarma** butonu (Backlog'a, benzer başlıkları atlar, "Atanan" sütunu ajana eşlenir) | `ui/src/lib/task-import.ts` (+test), `ui/src/components/board/ImportTasksButton.tsx`, `read-excel-file@9.3.10` |
| **Başlangıç tetikleyicisi:** repodaki yapılacaklar dosyası pano açılınca otomatik Backlog'a | sunucu `server/internal/adapter/http/handler_task_sheets.go` (+test), rotalar `handler_repository.go`; UI `ui/src/hooks/useTaskSheetAutoImport.ts`, `api.ts` (`listTaskSheets`, `fetchTaskSheet`) |
| **"Backlog'u başlat (N)"** butonu (pano + Backlog sayfası; ajanı yoksa PM'e atar) | `ui/src/components/board/MoveAllToTodoButton.tsx` |
| **"Neden ilerlemiyor?"** paneli: zincirleri köke kadar izler, sebebi ve kaç görevin beklediğini yazar; takılan karta **Yeniden başlat** | `ui/src/lib/board-diagnosis.ts` (+test), `ui/src/components/board/BoardStatusPanel.tsx`, `lib/project-board.ts` (`workOrderBlockerKeys`) |
| **Uyarı:** her sayfada kırmızı şerit + Dock rozeti + arka plandayken simge zıplar | `ui/src/components/layout/AttentionBanner.tsx`; köprü: `desktop/src/ipc/{channels,validate,host}.ts`, `src/main/{ipc,index}.ts`, `src/preload/cloud.ts`, `ui/src/lib/desktop-bridge.ts` (`setAttention`) |
| **Ajan çalışma süresi sınırı 10 dk:** ajana süre baştan söylenir; aşarsa durdurulur, kart `human_decision` ile Blocked'a | `server/internal/application/board/runner.go` (`withRunTimeLimit`, `parkOnTimeLimit`), `run_time_limit_test.go`, `prompts_runner.go`, `catalog/system/prompts/board/time_budget.md`, `time_limit_park_detail.md`, config `board.run_time_limit` (`domain/config.go`, `config/loader.go`, `resources/config.yml`, `platform/runtime/runtime.go`) |

Önemli ayrıntılar:

- Yapılacaklar dosyası **adından** tanınır: adında yapilacak / todo / task / gorev /
  backlog / roadmap geçen `.xlsx` veya `.csv`, repo kökünden en fazla 2 seviye derinde.
  Veri CSV'leri (ör. besin tablosu) bu yüzden görev olmaz.
- Aynı dosya bir kez işlenir (localStorage anahtarı: yol + değiştirilme zamanı). Dosya
  değişince yeniden okunur. Tekrarı asıl engelleyen **benzer başlık kontrolü**
  (`isDuplicateTitle`: 5 harflik kök, kısa başlığa göre %60 örtüşme). Victus
  Excel'inde 41 satırın 40'ı panoda zaten var olarak tanındı.
- Excel'de "Durum = Tamamlandı" satırları atlanır. "Aşama" ve "Platform" açıklamaya yazılır.
- "Takıldı" tanımı: ajan sütununda (todo dahil), çalışan ajan yok, kart 15 dk'dır
  değişmemiş (`STALL_MINUTES`).
- Panodaki bekleme bağları görev listesinde gelmiyor. Kök, `blocked_question`
  metnindeki görev kodlarından ve o görevlerin **güncel** sütunundan bulunuyor.
  Metindeki `[sütun]` eski kalabilir, ona güvenme.

## 5. Kullanıcının tercihleri (kararlar)

- İçe aktarılan görevler **Backlog'da kalsın**. Başlatmayı kullanıcı seçer
  ("Backlog'u başlat" butonu).
- Ajan bir görevde **10 dakikadan fazla** çalışmasın, karara bağlasın.
- Bir şey beklediğinde sadece bildirim değil, görünür bir uyarı olsun.
- Panoda olan bitenin **sebebi** ajana sormadan görülebilsin.

## 6. Öğrenilen davranışlar ve bilinen sorunlar

- **Backlog ve Blocked hiç dispatch etmez.** Todo'daki görev ancak **atanmış ajan**
  varsa başlar.
- `blocked_by` bağı yalnızca engelleyen görev `done`/`released` olunca çözülür. `done`
  için görevin review → QA → UAT zincirinden geçmesi gerekir. Kod dışı (insan) işler
  bu yüzden zinciri kilitler. API'de bağı kaldırma yolu yok. T-39'da çözüm, görevi
  T-43'e kopyalayıp silmekti (silme bağları cascade ile kaldırır).
- **Hata:** QA ajanı Claude kullanım limitine takılınca görev Blocked'a alınmadı,
  `in_qa`'da 5 saat sahipsiz kaldı. Elle `POST .../runs/<runId>/rerun` ile kurtarıldı.
  Kök nedeni bulunmadı. Takılma paneli ve 10 dk sınırı bunu görünür kılıyor ama
  düzeltmiyor.
- Ajan çalışırken macOS bir kez Erişilebilirlik izni istedi (mobil test/simülatör).
  Kullanıcı izin verdi.
- QA "UI kanıtı yok" kapısı: arayüzü olan repoda ekran görüntüsü almadan QA onayı
  reddediliyor.

## 7. Victus panosunun durumu (2026-10-07 akşamı)

- **T-29** (sesli kayıt modülü): PM tüm kriterleri reddetti. Kayıt; T-34 (veri saklama)
  ve T-30 (kalori ayrıştırma) olmadan çalışamıyor. Ama zincirde bunlar T-29'dan
  **sonra** geliyor ve T-29'u bekliyor (planlama hatası). **Kullanıcı kararı bekleniyor:**
  - A (önerilen): T-29 kriterlerini kayıt + metne çevirme ile sınırla.
  - B: Sırayı T-34 → T-30 → T-29 yap.
- **T-40** (Türkçe besin tablosu): Blocked. 6. kriter gerçek USDA `FDC_API_KEY` istiyor,
  `DEMO_KEY` saatlik sınırda (HTTP 429). Kullanıcı ya anahtar alacak
  (fdc.nal.usda.gov/api-key-signup) ya da kriteri atlayıp Done diyecek.
- Zincir: T-30 → T-31 → … → T-38 ve TC-14, hepsi T-29 (ve T-30, T-40) üzerinden bekliyor.
- **T-43**: T-39'un (marka/TÜRKPATENT/domain kaydı) Backlog'daki kopyası, insan işi.
- PR sırası notu: T-29'un PR'ı (#8), TC-13'ün PR'ının (#7) üstüne kurulu. Önce #7 birleşmeli.

## 8. Olası sonraki işler

1. T-29 kararını uygula (A veya B).
2. Kullanım limiti sonrası "sahipsiz kalan görev" hatasının kök nedenini sunucuda bul
   (`quotaOrPark` / resume sweeper, `server/internal/application/board/runner.go`).
3. Panoda bekleme bağını kaldırma özelliği (sunucuda `task_relations` silme ucu + UI).
4. GitHub Issues içe aktarma (planlanan 2. aşama).
5. Değişiklikleri bir dala almak isteyip istemediğini sor (şu an commit yok, kullanıcı push istemiyor).
