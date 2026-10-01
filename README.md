# Мой ритм — трекер привычек

Адаптивное приложение на React, TypeScript и Vite. GitHub Pages размещает статический сайт, Firebase Authentication отвечает за вход по email и паролю, а Cloud Firestore хранит привычки и отметки. GitHub Actions собирает сайт с базовым путём `/habittracker/` и публикует каталог `dist`.

## Локальный запуск

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Заполните `VITE_FIREBASE_*` в `.env.local` значениями веб-конфигурации из Firebase Console и перезапустите Vite. Откройте адрес, который покажет команда (обычно `http://localhost:5173`). Если Firebase ещё не подключён, регистрация будет выключена и приложение покажет подсказку.

## Firebase Spark

Firebase-проект уже создан на бесплатном плане Spark: `habittracker-sevasent246`. Веб-приложение `Habit Tracker Web` зарегистрировано, вход **Email/Password** включён, а база Cloud Firestore Standard создана в регионе `europe-north1` (Финляндия). В базе опубликованы правила из `firestore.rules`: пользователь читает и меняет только документы под собственным Firebase UID. Для входа с сайта добавлен домен `sevasent246-hue.github.io`; `localhost` оставлен разрешённым для разработки.

Локальная конфигурация веб-приложения хранится в `.env.local`. Если создаёте другой Firebase-проект, замените значения в этом файле и опубликуйте `firestore.rules` в его Firestore. Не подключайте Cloud Billing и не переходите на Blaze.

Файл `.env.local` исключён из Git. Firebase web config используется браузером и не является секретом. Не добавляйте в проект service account JSON, закрытые ключи или пароль Google. Приложению не нужен Firebase Admin SDK.

## Подключение GitHub Pages

В репозитории `sevasent246-hue/habittracker` откройте **Settings → Pages** и установите **Build and deployment → Source: GitHub Actions**.

Затем откройте **Settings → Secrets and variables → Actions → Variables** и создайте следующие repository variables из Firebase web config:

| Имя переменной | Значение из Firebase |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

Workflow `.github/workflows/pages.yml` передаёт эти значения как переменные окружения в шаг `npm run build`. Vite встраивает их в браузерную сборку. Для этих четырёх публичных значений используйте Actions Variables; секретные ключи аккаунта Firebase в GitHub не нужны.

После отправки кода в ветку `main` GitHub Actions автоматически соберёт и опубликует `dist` по адресу <https://sevasent246-hue.github.io/habittracker/>. Workflow также можно запустить вручную через **Actions → Build and publish to GitHub Pages → Run workflow**.

## Проверка локальной сборки

```powershell
npm run build
npm run preview
```

Сборка размещает ресурсы под `/habittracker/`. В приложении сейчас нет клиентского маршрутизатора: экран входа и трекер переключаются внутри одного URL, поэтому отдельный fallback для обновления вложенных маршрутов не требуется.

## Доступ к данным

Документы привычек находятся по пути `users/{Firebase UID}/habits/{habit ID}`. Правила Firestore позволяют читать и изменять документы только вошедшему пользователю с совпадающим UID и проверяют структуру сохраняемой привычки. Не заменяйте правила открытым доступом вроде `allow read, write: if true`.

GitHub Pages — только статический хостинг; аккаунты и база остаются в Firebase. На Spark превышение бесплатной квоты приостанавливает соответствующий продукт до сброса лимита. Не подключайте платёжный аккаунт, если хотите оставаться в рамках Spark.
