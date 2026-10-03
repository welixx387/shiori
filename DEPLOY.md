# Свой сервер для Shiori

Пошаговая инструкция: как запустить сайт на собственном сервере в России, чтобы он быстро
открывался у читателей без VPN, а аккаунты и тексты хранились у вас.

**Что получится:**

- `https://example.ru` — сайт;
- `https://api.example.ru` — Supabase: вход, база данных, обложки и аватары. По этому же адресу
  в браузере открывается Supabase Studio — панель управления базой (под паролем).

Всё работает на одном сервере, HTTPS-сертификаты выпускаются и продлеваются автоматически.
Займёт около часа, из них 20–40 минут — ожидание.

## Что купить

| Что | Где | Цена |
|---|---|---|
| Облачный сервер: 2 vCPU, 4 ГБ RAM, 50 ГБ NVMe, Ubuntu 24.04 | [Timeweb Cloud](https://timeweb.cloud), регион «Москва» | ≈ 1 200 ₽ в месяц |
| Домен `.ru` | Timeweb, REG.RU, RU-CENTER и др. | ≈ 200–1 000 ₽ в год |
| Почта, с которой сайт шлёт письма | Яндекс Почта | бесплатно |
| HTTPS-сертификаты | Let's Encrypt, выпускаются сами | бесплатно |

Цены ориентировочные, перед покупкой проверьте на сайтах. Продление домена обычно дороже первого года.

**Почему Timeweb Cloud и сервер в России:**

- оплата российской картой или по СБП;
- сервер в Москве — сайт быстро открывается у читателей. Зарубежные платформы (Vercel, Netlify,
  облачный Supabase, всё, что работает через Cloudflare) в России замедляют, а у части операторов,
  особенно мобильных, они не открываются совсем;
- закон 152-ФЗ требует хранить персональные данные россиян (email, никнеймы) на серверах в России;
- у Timeweb есть своё зеркало Docker Hub — программы для сервера скачиваются быстро и без ограничений.

Подойдёт и любой другой VPS с Ubuntu 24.04 и 4 ГБ памяти (Beget, Selectel, REG.RU…) — шаги те же.

**Почему 4 ГБ памяти:** вместе с сайтом на сервере работает Supabase — около дюжины программ
в контейнерах (база данных PostgreSQL, авторизация, API, хранилище файлов, панель управления).
Им нужно 2–3 ГБ, плюс запас на сборку сайта.

## Что понадобится

- компьютер с Windows 10/11, macOS или Linux — подключаться к серверу будем из встроенного терминала;
- аккаунт GitHub, где лежит код (репозиторий приватный, нужен токен — шаг 6);
- ящик на Яндексе для писем сайта (можно завести отдельный).

Ниже `example.ru` — ваш домен, `203.0.113.10` — IP-адрес вашего сервера. Подставляйте свои.

## Шаг 1. Купите сервер

1. Зарегистрируйтесь на [timeweb.cloud](https://timeweb.cloud) и пополните баланс.
2. Создайте облачный сервер:
   - образ (ОС) — **Ubuntu 24.04**;
   - регион — **Москва**;
   - конфигурация — **2 vCPU, 4 ГБ RAM, 50 ГБ NVMe**;
   - публичный IPv4-адрес должен быть включён (обычно включён по умолчанию);
   - остальное — по умолчанию.
3. Через пару минут сервер запустится. В панели и в письме будут **IP-адрес** и **пароль root** —
   сохраните их.

Сразу включите в настройках сервера автоматические бэкапы — см. «Резервные копии».

## Шаг 2. Купите домен и направьте его на сервер

1. Купите домен (раздел «Домены» у Timeweb или любой регистратор). Для `.ru` и `.рф` регистратор
   попросит подтвердить личность — это обычная процедура.
2. В управлении DNS домена создайте три A-записи:

   | Тип | Имя | Значение |
   |---|---|---|
   | A | `@` (сам домен) | `203.0.113.10` |
   | A | `www` | `203.0.113.10` |
   | A | `api` | `203.0.113.10` |

   Если у этих имён уже есть другие A- или AAAA-записи (регистратор часто направляет новый домен
   на свою заглушку) — удалите их.
3. Проверьте на своём компьютере, что записи заработали (обычно 5–30 минут, иногда до суток):

   ```
   nslookup api.example.ru
   ```

   В ответе должен быть IP вашего сервера. Так же проверьте `example.ru` и `www.example.ru`.

Cloudflare и другие «ускорители» не подключайте: в России Cloudflare замедляют.

## Шаг 3. Подключитесь к серверу

Откройте терминал: в Windows — «Терминал» или PowerShell (Пуск → «PowerShell»), в macOS — «Терминал».

```
ssh root@203.0.113.10
```

На вопрос `Are you sure you want to continue connecting` ответьте `yes`, затем вставьте пароль root
(правой кнопкой мыши; символы при вводе не видны — так и должно быть) и нажмите Enter.

Все команды дальше выполняются на сервере, в этом окне. Копируйте блоки целиком.

## Шаг 4. Подготовьте сервер

Обновления, файл подкачки (запас памяти на время сборки), брандмауэр и защита от подбора пароля:

```bash
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt update && apt -y upgrade
apt -y install git curl ufw fail2ban
timedatectl set-timezone Europe/Moscow

fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw --force enable
reboot
```

Сервер перезагрузится, чтобы применились обновления. Подождите минуту и подключитесь снова (шаг 3).

## Шаг 5. Установите Docker

Supabase и сборка сайта работают в контейнерах Docker. Ставим его из репозитория Ubuntu
и подключаем зеркало Docker Hub от Timeweb:

```bash
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://dockerhub.timeweb.cloud"] }' > /etc/docker/daemon.json
DEBIAN_FRONTEND=noninteractive apt -y install docker.io docker-compose-v2
docker compose version
```

Последняя команда должна вывести `Docker Compose version 2.…` (нужна 2.24 или новее).
Если зеркало окажется недоступно, Docker сам пойдёт напрямую в Docker Hub.

## Шаг 6. Скачайте код сайта

Репозиторий на GitHub приватный, поэтому серверу нужен токен только для чтения:

1. GitHub → аватар → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Token name** — например, `shiori-server`; **Expiration** — на ваш выбор;
   **Repository access** → **Only select repositories** → `shiori`;
   в **Permissions** добавьте **Contents** с доступом **Read-only**.
3. Нажмите **Generate token** и скопируйте токен (`github_pat_…`) — GitHub покажет его один раз.

На сервере:

```bash
git config --global credential.helper store
git clone https://github.com/welixx387/shiori.git ~/shiori
```

Git спросит **Username** — введите `welixx387`, **Password** — вставьте токен. Git запомнит его,
и при обновлениях вводить ничего не придётся.

## Шаг 7. Установите Supabase

Официальный установщик скачает проверенную версию Supabase (v0.8.2), сгенерирует уникальные ключи
и пароли и загрузит образы. Это 5–15 минут:

```bash
cd ~
curl -fsSL https://raw.githubusercontent.com/supabase/supabase/refs/tags/self-hosted/v0.8.2/docker/setup.sh -o supabase-setup.sh
sh supabase-setup.sh -y --ref self-hosted/v0.8.2
```

В конце будет `Setup complete. Project ready at: /root/supabase-project`. Все настройки и секреты
лежат в `~/supabase-project/.env` — никому этот файл не показывайте.

## Шаг 8. Настройте адреса и почту

Письма с подтверждением регистрации и сбросом пароля сайт отправляет через обычный почтовый ящик.
Подготовьте ящик на Яндексе:

1. В Яндекс Почте: **Настройки** → **Все настройки** → **Почтовые программы** — разрешите доступ
   по протоколу IMAP и способ авторизации «Пароли приложений и OAuth-токены».
2. На [id.yandex.ru](https://id.yandex.ru) → **Безопасность** → **Пароли приложений** — создайте
   пароль для почты и скопируйте его.

Впишите в первые три строки свои данные и выполните блок целиком:

```bash
cd ~/supabase-project
DOMAIN=example.ru              # ваш домен — без https:// и www
MAIL=shiori.site@yandex.ru     # ящик, с которого сайт отправляет письма
MAIL_PASS=abcdefghijklmnop     # пароль приложения из Яндекс ID

setenv() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
setenv SUPABASE_PUBLIC_URL "https://api.$DOMAIN"
setenv API_EXTERNAL_URL "https://api.$DOMAIN/auth/v1"
setenv SITE_URL "https://$DOMAIN"
setenv ADDITIONAL_REDIRECT_URLS "https://$DOMAIN/**"
setenv PROXY_DOMAIN "api.$DOMAIN"
setenv SMTP_HOST smtp.yandex.ru
setenv SMTP_PORT 465
setenv SMTP_USER "$MAIL"
setenv SMTP_PASS "$MAIL_PASS"
setenv SMTP_ADMIN_EMAIL "$MAIL"
setenv SMTP_SENDER_NAME Shiori

grep -E '^(SITE_URL|SUPABASE_PUBLIC_URL|SMTP_USER)=' .env
```

В выводе должны быть ваш домен и ящик.

**Без почты (быстрый старт).** Уберите из блока строки `MAIL=`, `MAIL_PASS=` и все `setenv SMTP_…`,
а в конец добавьте `setenv ENABLE_EMAIL_AUTOCONFIRM true` — регистрация будет без подтверждения email.
«Забыли пароль?» заработает, только когда настроите почту (см. «Если что-то не работает»).

## Шаг 9. Подключите сайт и запустите сервер

Веб-сервер Caddy (входит в Supabase) будет отдавать сайт на `example.ru`, API — на `api.example.ru`
и сам получит HTTPS-сертификаты. **Перед этим шагом убедитесь, что DNS из шага 2 уже работает.**

```bash
cd ~/supabase-project
DOMAIN=$(grep '^SITE_URL=' .env | cut -d/ -f3)

cat >> volumes/proxy/caddy/Caddyfile <<EOF

$DOMAIN {
    root * /srv/site
    encode zstd gzip
    handle /assets/* {
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }
    handle {
        header Cache-Control "no-cache"
        try_files {path} /index.html
        file_server
    }
}

www.$DOMAIN {
    redir https://$DOMAIN{uri} permanent
}
EOF

cat > docker-compose.override.yml <<'EOF'
services:
  caddy:
    volumes:
      - /var/www/shiori:/srv/site:ro
  supavisor:
    ports: !reset []
EOF

mkdir -p /var/www/shiori
sh run.sh config add caddy override
sh run.sh start
```

Что здесь происходит:

- в `Caddyfile` добавляется сайт: файлы из `/var/www/shiori`, долгий кэш для файлов сборки,
  переадресация с `www`;
- `docker-compose.override.yml` даёт Caddy доступ к папке сайта и закрывает снаружи порты базы данных
  (5432 и 6543) — из интернета доступны только 80 и 443;
- `run.sh start` запускает всё и ждёт, пока сервисы будут готовы (первый раз — 2–5 минут).

Проверка:

```bash
sh run.sh status
curl -s https://api.$DOMAIN/auth/v1/.well-known/jwks.json
```

Все сервисы должны быть `healthy`, а `curl` — вернуть JSON вида `{"keys":[…]}`. Если `curl`
ругается на сертификат, подождите минуту — Caddy ещё получает его.

## Шаг 10. Опубликуйте сайт

```bash
sh ~/shiori/deploy/publish.sh
```

Скрипт [`deploy/publish.sh`](deploy/publish.sh):

1. создаёт в базе таблицы, права доступа и хранилища для обложек и аватаров
   ([`supabase/schema.sql`](supabase/schema.sql));
2. собирает сайт с адресом вашего API — в контейнере, Node.js ставить не нужно;
3. копирует готовые файлы в `/var/www/shiori`.

Первый раз — 3–5 минут. В конце появится `Готово! Сайт: https://example.ru`.

## Шаг 11. Станьте администратором

1. Откройте `https://example.ru` → **Войти** → **Регистрация**.
2. Подтвердите email по ссылке из письма.
3. **Первый зарегистрированный аккаунт автоматически становится администратором** — появится раздел
   «Админка». Зарегистрируйтесь сразу после публикации, пока этого не сделал кто-то другой.
4. В «Админке» нажмите «Демо-тайтлы», чтобы загрузить примеры, или сразу добавляйте свои тайтлы.

Supabase Studio — `https://api.example.ru`, логин `supabase`, пароль — значение `DASHBOARD_PASSWORD`
из вывода `sh ~/supabase-project/run.sh secrets`. Для публикации тайтлов Studio не нужна: всё есть
в «Админке» сайта.

## Как обновлять сайт

```bash
cd ~/shiori && git pull && sh deploy/publish.sh
```

Скрипт сам применит изменения схемы базы, если они есть. Читатели обновление не заметят: старые
файлы не удаляются, новая версия подхватится при следующем открытии страницы.

Своё название сайта вместо «Shiori»: `VITE_SITE_NAME="Моё ранобэ" sh deploy/publish.sh`.

Покупка кейсов через @CryptoBot работает через серверную функцию Vercel (`api/cryptobot.ts`),
поэтому на своём сервере по этой инструкции она пока недоступна: бесплатные кейсы, выдача
кейсов администратором, карточки и обмены работают.

**Обновление самого Supabase** — необязательно, раз в несколько месяцев, после свежего бэкапа:

```bash
cd ~/supabase-project
sh update.sh --dry-run          # что изменится
sh update.sh
sh run.sh pull && sh run.sh recreate
```

`update.sh` не трогает `.env`, `docker-compose.override.yml` и данные, а правку в `Caddyfile`
переносит в новую версию. Если он сообщит о конфликте в этом файле — откройте его и проверьте,
что блок сайта на месте.

## Резервные копии

1. **Бэкапы в панели Timeweb** — самый простой вариант: копия всего сервера по расписанию,
   восстановление в один клик. Включите в настройках сервера (услуга платная).
2. **Ежедневная копия данных на сервере** — база, обложки, аватары и `.env`; копии хранятся 14 дней:

   ```bash
   mkdir -p ~/backups
   sh ~/shiori/deploy/backup.sh
   (crontab -l 2>/dev/null; echo '30 4 * * * sh /root/shiori/deploy/backup.sh >> /root/backups/backup.log 2>&1') | crontab -
   ```

   Вторая команда сразу делает копию, третья включает автоматическую копию каждую ночь в 4:30.
   Время от времени скачивайте копии к себе — эту команду выполняйте **на своём компьютере**:

   ```
   scp -r root@203.0.113.10:backups ./shiori-backups
   ```

**Откатить базу к копии** (например, если случайно удалили тайтл). Всё, что изменилось после
копии, пропадёт:

```bash
cd ~/supabase-project
sh run.sh stop
docker compose up -d --wait db
docker exec -i supabase-db pg_restore -U supabase_admin -h localhost -d postgres --clean --if-exists < ~/backups/db_2026-10-02_04-30.dump
sh run.sh start
```

Имя файла подставьте своё (`ls ~/backups`). `pg_restore` может вывести предупреждения о системных
объектах Supabase — если после запуска сайт открывается и данные на месте, всё в порядке.
Вернуть обложки и аватары: `tar -xzf ~/backups/files_….tar.gz -C ~/supabase-project volumes/storage`.

**Переезд на новый сервер.** Выполните шаги 1–7, затем распакуйте архив
`tar -xzf files_….tar.gz -C ~/supabase-project` — он вернёт прежний `.env` с ключами и файлы.
Шаг 8 пропустите, выполните шаг 9, откатите базу командами выше и опубликуйте сайт (шаг 10).

## Если что-то не работает

| Проблема | Что сделать |
|---|---|
| Сервис не становится `healthy` | `sh run.sh status` — какой именно; `sh run.sh logs <сервис>` — почему. Проверьте память: `free -h`. |
| Сайт не открывается или браузер ругается на сертификат | Проверьте DNS (`nslookup`) и логи: `sh run.sh logs caddy`. После исправления DNS: `sh run.sh restart caddy`. |
| Образы не скачиваются (`timeout`, `403`, `toomanyrequests`) | Проверьте `/etc/docker/daemon.json`, выполните `systemctl restart docker` и повторите команду. |
| `publish.sh` падает на `npm ci` | Повторите с другим зеркалом: `NPM_REGISTRY=https://registry.npmmirror.com sh ~/shiori/deploy/publish.sh` |
| Письма не приходят, при регистрации ошибка отправки | `sh run.sh logs auth` — ищите ошибки SMTP. Проверьте пароль приложения и что `SMTP_USER` и `SMTP_ADMIN_EMAIL` — один и тот же ящик. Загляните в «Спам». |
| Начинали без почты и хотите включить её | Выполните блок из шага 8 целиком, затем `setenv ENABLE_EMAIL_AUTOCONFIRM false` и `sh run.sh start`. |
| Поменяли `.env` | `cd ~/supabase-project && sh run.sh start` — изменённые сервисы перезапустятся. |
| Поменяли `Caddyfile` | `cd ~/supabase-project && sh run.sh restart caddy` |
| Администратором стал чужой аккаунт | Выдайте права себе (команда ниже), затем снимите их с чужого аккаунта в «Админке» → «Пользователи». |
| Не пускает по SSH после неверных паролей | fail2ban блокирует IP на 10 минут — подождите или войдите через консоль в панели Timeweb. |

Выдать права администратора вручную:

```bash
docker exec supabase-db psql -U postgres -h localhost -d postgres -c "update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');"
```

## Закон и правила

- **152-ФЗ.** Сайт собирает email и никнеймы — это персональные данные. Сервер в России закрывает
  требование о локализации. Ещё нужны: политика обработки персональных данных на сайте, согласие
  пользователя при регистрации и уведомление Роскомнадзора об обработке данных
  ([pd.rkn.gov.ru](https://pd.rkn.gov.ru)). Сделайте это до открытия сайта для всех.
- **Тексты.** Публикуйте произведения и переводы, на которые у вас есть права: по жалобе
  правообладателя хостер обязан ограничить доступ к сайту.

## Шпаргалка

| Задача | Команда |
|---|---|
| Обновить сайт | `cd ~/shiori && git pull && sh deploy/publish.sh` |
| Состояние сервисов | `cd ~/supabase-project && sh run.sh status` |
| Логи сервиса | `cd ~/supabase-project && sh run.sh logs auth` (или `caddy`, `db`, `storage`…) |
| Перезапустить всё | `cd ~/supabase-project && sh run.sh restart` |
| Пароли и ключи | `cd ~/supabase-project && sh run.sh secrets` |
| Бэкап вручную | `sh ~/shiori/deploy/backup.sh` |
| Место на диске и память | `df -h /` и `free -h` |
