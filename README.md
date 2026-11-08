# Ресурсы для тестирования DFO Online

## Установка игры с готовыми модами

[Скачать онлайн-установщик DFO Online Testers](https://github.com/principialnostb/daggerfall-js-source/releases/download/testers-1794170475053/DFO-Online-Testers-Setup.exe) — около 680 КБ. Запустите EXE: он сам скачает пакет игры с модами (около 1,9 ГБ), установит игру и создаст ярлыки. Отдельно скачивать ZIP этой ветки и подключать встроенные наборы не требуется. Последующие автообновления отключены.

[Страница тестового релиза](https://github.com/principialnostb/daggerfall-js-source/releases/tag/testers-1794170475053).

## Ресурсы для ручного подключения

Эта отдельная ветка содержит наборы ресурсов для тестировщиков форка. Код игры, установщик и автообновление здесь отсутствуют. Наборы сторонних авторов сохранены с исходными README и сведениями об авторстве; их наличие в этой ветке не делает их работой автора форка. Уточнение общего каталога авторов и ссылок ещё продолжается.

[Скачать все ресурсы одним ZIP](https://github.com/principialnostb/daggerfall-js-source/archive/refs/heads/resources.zip)

## Подключение

1. Скачайте ZIP и распакуйте его полностью.
2. Укажите собственные файлы Morrowind через Mods & files в игре: этот архив не содержит игровых BSA/ESM.
3. В Enhanced Mod Compatibility откройте нужную карточку и нажмите «Подключить ресурсы».
4. Выберите папку именно этого набора из распакованной `Mods` — например `Mods/Bodies/Better Bodies`. Не выбирайте общий корень `Mods` для каждой карточки.
5. Подключите все компоненты связки, включите её и перезапустите игру.

Для Complete Armor Joints выбирайте вложенную папку `Mods/Textures/Better Morrowind Armor/Complete Armor Joints`.

Некоторые сохранённые в наборе дополнительные анимации и Seamless DMRA читаются загрузчиками исходной сборки, но могут не иметь отдельной карточки подключения в текущем EXE. Этот архив сам по себе новых кнопок импорта не добавляет. Перенос папки Mods рядом с portable EXE не является установкой: используйте существующие окна подключения.

Весь архив большой; размеры ниже указаны до сжатия. manifest.json содержит полный список файлов, размеры и SHA-256.

## Состав

| Папка | Файлов | Размер |
| --- | ---: | ---: |
| `Animations/Axel's Sexy Walk Fixed` | 6 | 0.2 MiB |
| `Animations/Hit Reactions Animated v2 -- OpenMW` | 464 | 14.7 MiB |
| `Animations/Morrowind Animation Overhaul` | 3 | 5.3 MiB |
| `Animations/OpenMW Dynamic Animations` | 276 | 3.9 MiB |
| `Animations/ReAnimation v3 - Complete - first-person animation pack` | 264 | 52.6 MiB |
| `Animations/Simply animated cloaks` | 248 | 198.3 MiB |
| `Animations/Simply Walking` | 4 | 9.1 MiB |
| `Bodies/Better Bodies` | 198 | 19.4 MiB |
| `Bodies/Better Hands` | 33 | 44.5 MiB |
| `Bodies/Robert's bodies` | 70 | 58.2 MiB |
| `Bodies/Seamless DMRA body replacer` | 44 | 82.9 MiB |
| `Textures/Better Clothes Retextured` | 123 | 150.5 MiB |
| `Textures/Better Morrowind Armor` | 480 | 12.7 MiB |
| `Textures/Intelligent Textures` | 4496 | 2014.4 MiB |
| `Textures/Robert's Bodies Based Gauntlets` | 5 | 0.4 MiB |
| `Textures/Vurt's Better Clothes Retexture` | 493 | 242.7 MiB |
| `Textures/Westly's Fine Clothiers of Tamriel` | 1413 | 404.3 MiB |

## Исключено по запросу владельца

- High Resolution Better Body Female Textures.
- Westly's Faces Refurbished.
- Better Bodies 3.2 / Better Beasts.

Обычный Better Bodies включён. Atlas Textures не включены: игра использует только Intelligent Textures 00 Core. Также не включены постройки, оружие и отдельные исходные наборы для генерации дополнительных обликов. Ресурсы Skyrim SE и оригинальные игровые архивы сюда не входят.

Исключённые пакеты в этой загрузке недоступны. Это не меняет сохранённые настройки игры и не заменяет проверку совместимости на конкретной тестовой сборке.
