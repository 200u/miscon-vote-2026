# M26 投票システム

各iPad単体で投票を保存し、端末画面だけでも手動集計できる投票システムです。票はサーバーには送らず、各iPadのSafari内 `localStorage` に保存します。

## ファイル構成

すべてのファイルはリポジトリのルートに置きます。`public/` サブディレクトリは使いません。

```text
index.html
vote.html
admin.html
result.html
aggregate.html
shared.js
sw.js
qrcode-v3.js
manifest.webmanifest
images/
  akane.jpg
  hamamero.jpg
  reina.jpg
  sorara.jpg
  yusepi.jpg
  ruta.jpg
  hina.jpg
```

HTMLから見て `./images/akane.jpg` のような相対パスで画像を参照します。

候補者データと画像パスは `shared.js` の `M26.CANDIDATES` に一本化しています。各画面は候補者名や画像パスを個別定義せず、必ず `M26.CANDIDATES` を参照します。

## GitHub Pages 設定

リポジトリの Settings → Pages → Source を **「Deploy from a branch」→ ブランチ `main`（または `master`）→ フォルダ `/ (root)`** に設定してください。

`public/` を Source に設定するとファイルが見つからなくなります。

## スマホテザリング運用

### 本番前

1. スマホのテザリングをONにする
2. iPad 4台をそのテザリングに接続する
3. 各iPadのSafariでGitHub Pages URL（`https://<user>.github.io/<repo>/`）を開く
4. `admin.html` を開く
5. 端末番号を `01`〜`04` の重複しない番号に設定する（端末ごとに異なる番号）
6. 公演番号を正しい番号（1〜4）に設定する
7. **保存** を押す
8. 「画像診断」で7枚すべてが `OK` になることを確認する
9. `投票開始` を押す
10. 「投票画面」に切り替え、7人全員の写真が表示されることを確認する
11. 写真が出ない場合も「写真未読込」と表示され、画面が壊れないことを確認する
12. テスト投票として7人全員に1回ずつ投票し、nullエラーが出ないことを確認する
13. `admin.html` の票数が増えたことを確認する
14. `result.html` で候補者別得票数が大きく見えることを確認する
15. Safariを再読み込みしても票数が残ることを確認する
16. `この公演をリセット` で0票に戻ることを確認する
17. 本番直前に対象公演が0票・端末番号・公演番号を再確認する
18. `投票開始` を押し、`vote.html` を表示して観客に渡す

### 本番中

- Safariの**プライベートブラウズを使わない**
- Safariの「履歴とWebサイトデータを削除」をしない（票が消えます）
- 端末番号を重複させない
- 公演番号を途中で変えない
- GitHub PagesのURLを途中で変えない
- 票は各iPad内に保存される（4台の票は自動合算されない）

### 投票終了後（集計）

1. 各iPadを回収する
2. 各iPadで `admin.html` または `result.html` を開く
3. 端末番号と公演番号を確認する
4. 候補者別得票数を読む
5. 4台分を手動で合計する
6. 可能なら `aggregate.html` に集計コード（QRまたはテキスト）を取り込む
7. QR集計が失敗しても、手動集計で確定できる（QRはあくまで補助）

## 保存仕様

- 保存先: 各iPadのSafari内 `localStorage`
- 保存キー: `m26-device-state-v3`
- `performanceId` ごとに票を分離（公演1〜4が独立して保存される）
- `deviceId` で端末番号を管理
- 投票データは候補者順の `counts` 配列（`M26.CANDIDATES` の並び順に固定）
- `M26.addVote(candidateId)` で加算、不正IDなら例外を投げる
- `M26.undoLastVote()` で直前票を取り消せる
- `M26.adjustVote(candidateId, delta)` で補正できる
- `M26.rankingFromCounts(counts)` で順位表示できる

## 手動集計出力

`admin.html` には以下の1行集計テキストが表示され、ボタンでコピーできます。

```text
公演2 端末03 あかね8 はまめろ5 れいな4 そらら7 ゆせぴ10 るた3 ひな4 合計41
```

Googleスプレッドシート貼り付け用TSV（2行）もコピーできます。

```text
公演	端末	あかね	はまめろ	れいな	そらら	ゆせぴ	るた	ひな	合計
2	03	8	5	4	7	10	3	4	41
```

## GitHub Pages 公開後の画像確認URL

GitHub Pages公開後、以下URLを直接開いて7枚すべて表示されるか確認してください。

```text
https://<user>.github.io/<repo>/images/akane.jpg
https://<user>.github.io/<repo>/images/hamamero.jpg
https://<user>.github.io/<repo>/images/reina.jpg
https://<user>.github.io/<repo>/images/sorara.jpg
https://<user>.github.io/<repo>/images/yusepi.jpg
https://<user>.github.io/<repo>/images/ruta.jpg
https://<user>.github.io/<repo>/images/hina.jpg
```

（例: `https://200u.github.io/miscon-vote-2026/images/akane.jpg`）

## 注意

- Safariの履歴やWebサイトデータを削除すると、そのiPad内の票は消えます。
- 端末番号が重複すると、QR集計では同じ公演・同じ端末番号のデータとして上書きされます。
- 公演番号を間違えると、別公演の票として保存・集計されます。
- 本番中はSafariのWebサイトデータ削除や完全初期化をしないでください。
