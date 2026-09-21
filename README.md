# EMOLI AR MOMENT

チェキ風カードの写真部分をスマートフォンのカメラで認識し、その位置・傾き・遠近に追従して動画を重ねるWebARサイトです。専用アプリは不要です。

現在の試作では、次の素材を設定済みです。

- サンプル動画: `public/assets/movie.mp4`
- 認識用画像: `public/assets/target.jpg`
- MindAR認識データ: `public/assets/target.mind`
- 動画のポスター画像: `public/assets/poster.jpg`

`target.jpg` と `poster.jpg` は、指定された2本目のサンプル動画から、認識しやすい街並みのフレームを選んで作成しています。暗くぼけた冒頭フレームは特徴点が少なく追従が不安定だったため使用していません。まず `target.jpg` を印刷するか別端末に表示し、公開URLのカメラから映すと動作を確認できます。

## 主な機能

- QRコードから開くと、トップ画面を挟まずカメラ権限を要求
- MindARによる画像認識
- カードに追従する動画表示
- 認識時は動画を先頭から再生
- 認識を失った後、短い猶予を置いて動画を停止・先頭へ戻す
- 音声ON / OFF
- カメラ終了時とバックグラウンド移行時の停止処理
- カメラ権限、非対応ブラウザ、読み込み失敗向けの日本語エラー
- ARを使えない場合の動画単体再生
- `?debug=true` による開発情報表示
- カメラ映像を保存・送信しない端末内処理

## 公開先について（重要）

一般利用者へ配布するQRコードには、Cloudflare Pagesで公開した次の形式のURLを使用します。

```text
https://＜Cloudflare Pagesのプロジェクト名＞.pages.dev/
```

開発中だけ使用するプレビューURLはQRコードに使用しないでください。プレビューURLはログインを求める場合があり、一般利用者向けの公開URLではありません。

このプロジェクトの `/` は、QRコードから直接開くARカメラ画面です。装飾的なトップページや開始ボタンはありません。初回アクセスではブラウザがすぐにカメラの許可を求め、許可後はそのまま画像認識を開始します。以前カメラを拒否している場合は、エラー画面からブラウザ設定を直して再試行します。

## 必要な環境

- Node.js 22（`.node-version` では22.16.0を指定）
- pnpm
- 開発確認: 比較的新しいChrome、Edgeなど
- 本番利用: 比較的新しいiPhone Safari / Android Chrome
- スマートフォンでカメラを使う場合はHTTPS

## ローカルで起動する

```bash
pnpm install
pnpm dev
```

表示された `http://localhost:3000` をブラウザで開きます。`file://` でHTMLを直接開く方法では、カメラやモジュールの読み込みが正しく動きません。

PCの `localhost` はカメラ利用の例外として安全な接続とみなされますが、同じLAN内のスマートフォンからPCのIPアドレスへHTTP接続した場合はカメラを利用できません。スマートフォン実機では、HTTPSの公開URLを使うのが確実です。

## 試し方

1. `public/assets/target.jpg` を印刷するか、サイトを開く端末とは別の画面に表示します。
2. 公開URLを開きます。
3. 表示された確認でカメラの使用を許可します。
4. `target.jpg` の全体がカメラ画面に入るように映します。
5. 認識すると、写真部分に動画が重なります。

AR認識の確認には、印刷物またはサイトを開く端末とは別の画面が必要です。

## 素材を差し替える

### 1. 動画を差し替える

新しい動画を次の場所へ、同じファイル名で配置します。

```text
public/assets/movie.mp4
```

推奨条件:

- MP4 / H.264
- 720p程度
- 5〜15MB程度
- 最初と最後の構図を近づけ、自然にループできる内容
- 印刷する静止画と同じ構図から始まる動画

ブラウザは初回をミュートで自動再生します。利用者が画面上のボタンを押した場合だけ音声を有効にします。

### 2. 認識用画像を差し替える

印刷物の「動画に置き換えたい写真部分」と同じ画像を、次の場所へ配置します。

```text
public/assets/target.jpg
```

余白が多い画像、単色部分が多い画像、ぼやけた画像、同じ模様の繰り返しが多い画像は認識しづらくなります。人物・背景・小物などの特徴が画面全体に分散している画像を推奨します。

### 3. `target.mind` を作り直す

`target.jpg` を変更したら、認識データも必ず作り直します。

1. [MindAR Image Targets Compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile/) を開きます。
2. 新しい `target.jpg` をドロップします。
3. `Start` を押し、特徴点の解析が終わるまで待ちます。
4. `Download` で `.mind` ファイルを保存します。
5. ダウンロードしたファイルを `target.mind` に名前変更します。
6. 次の場所へ上書きします。

```text
public/assets/target.mind
```

MindAR公式の詳しい説明は[Compile Target Images](https://hiukim.github.io/mind-ar-js-doc/quick-start/compile/)を参照してください。

### 4. ポスター画像を差し替える

動画の読み込み前に表示する画像を次の場所へ配置します。

```text
public/assets/poster.jpg
```

通常は `target.jpg` と同じ画像で構いません。

## 動画の位置と大きさを調整する

設定は `app/ar-config.ts` にまとめています。

```ts
overlay: {
  width: 1,
  height: 0.5625,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
}
```

- `width`: 認識画像の横幅を1とした動画面の幅
- `height`: 動画面の高さ
- `positionX`: 左右位置
- `positionY`: 上下位置
- `positionZ`: 手前・奥の位置

現在の素材は16:9なので、`height` は `9 ÷ 16 = 0.5625` です。素材の縦横比を変更した場合は、原則として `height = 画像の高さ ÷ 画像の幅` にします。

チェキの白枠を含む画像全体を認識対象にする場合は、動画が写真部分だけに重なるよう `width`、`height`、`positionY` を実機で微調整してください。

## ARランタイムを作り直す

MindARまたはThree.jsのバージョンを変更した場合だけ、同梱ランタイムを再生成します。

```bash
pnpm build:ar-runtime
```

`public/runtime/mindar-runtime.iife.js` が更新されます。通常の素材差し替えでは、この作業は不要です。

## デバッグ表示

URLの末尾に `?debug=true` を付けます。

```text
https://example.com/?debug=true
```

カメラ、MindAR、ターゲット、動画の状態とブラウザ情報がカメラ画面に表示されます。通常アクセスでは表示されません。

## Cloudflare Pages用の静的ビルド

```bash
pnpm install --frozen-lockfile
pnpm run build:pages
```

ビルドコマンドは `pnpm run build:pages`、出力ディレクトリは `out` です。`out/index.html` とARに必要な動画・認識データ・ランタイムが生成されます。サーバープログラムやデータベースを必要としない静的サイトなので、Cloudflare Pagesからそのまま配信できます。

ローカルでビルド結果を確認する場合は次を実行します。

```bash
pnpm run preview
```

`out` は自動生成物のためGitHubへアップロードする必要はありません。Cloudflare PagesがGitHub上のソースコードから毎回生成します。

## GitHubへアップロードする

### 1. GitHubで空のリポジトリを作る

1. GitHubへログインします。
2. 「New repository」を押します。
3. リポジトリ名を入力します。例: `emoli-ar-moment`
4. 公開範囲を選びます。Cloudflare PagesはPrivateリポジトリにも接続できます。
5. README、`.gitignore`、Licenseは追加せず、空の状態で作成します。

### 2. このフォルダをGitHubへ送る

GitHubが表示するリポジトリURLに置き換えて、プロジェクトのルートで実行します。

```bash
git branch -M main
git remote add origin https://github.com/＜GitHubユーザー名＞/＜リポジトリ名＞.git
git push -u origin main
```

すでに `origin` という接続先を設定している場合は、`git remote add origin` の代わりに次を使います。

```bash
git remote set-url origin https://github.com/＜GitHubユーザー名＞/＜リポジトリ名＞.git
```

## Cloudflare Pagesへ公開する

### 1. GitHubリポジトリを接続する

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)へログインします。
2. 左側の「Workers & Pages」を開きます。
3. 「Create application」を押します。
4. 「Pages」→「Connect to Git」を選びます。
5. GitHubを連携し、先ほど作成したリポジトリを選択します。
6. 「Begin setup」を押します。

### 2. ビルド設定を入力する

Cloudflare Pagesの設定値は次のとおりです。

| 設定項目 | 入力値 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Next.js (Static HTML Export)` |
| Build command | `pnpm run build:pages` |
| Build output directory | `out` |
| Root directory | 空欄（GitHubリポジトリのルート） |

環境変数は必須ではありません。Node.jsのバージョンは、リポジトリ直下の `.node-version` により22.16.0が使用されます。

### 3. 公開する

1. 「Save and Deploy」を押します。
2. ビルドが完了して「Success」と表示されるまで待ちます。
3. 次の形式で発行されたURLを開きます。

```text
https://＜Cloudflare Pagesのプロジェクト名＞.pages.dev/
```

Cloudflare Pagesの `pages.dev` URLはHTTPSです。カメラAPIはHTTPS環境でのみ利用できるため、スマートフォン向けQRコードには必ずこのURL、またはCloudflare Pagesに設定した独自ドメインのHTTPS URLを使用します。

### 4. QRコードへ設定する

QRコードには、発行された本番URLのルートをそのまま設定します。

```text
https://＜Cloudflare Pagesのプロジェクト名＞.pages.dev/
```

末尾の `/` 以外に特別なパスは不要です。QRコードから開くと、トップページを挟まずカメラ許可が表示され、許可後すぐに画像認識を開始します。

次のURLはQRコードに使用しません。

- ChatGPTまたはCodexのプレビューURL
- `localhost` のURL
- PCのローカルIPアドレスを使ったHTTP URL
- Cloudflare Pagesのビルド途中にだけ表示される管理画面URL

### 5. ログインなしで実機確認する

1. ChatGPT、Codex、Cloudflareからログアウトした状態、またはSafari／Chromeのプライベートブラウズで `pages.dev` URLを開きます。
2. ブラウザのカメラ確認で「許可」を選びます。
3. そのまま画像認識が始まり、背面カメラの映像が全面に表示されることを確認します。
4. `target.jpg` と同じ印刷物または別画面を映し、動画が重なることを確認します。

Cloudflare Pages側にアクセス制限やCloudflare Accessを追加すると、一般利用者にもログイン画面が表示されます。この用途ではアクセス制限を追加せず、一般公開のまま使用してください。

## iPhoneで確認する

1. HTTPSの公開URLをSafariで開きます。
2. 表示された確認でカメラの利用を許可します。
3. 拒否した場合は、iPhoneの設定またはSafariのWebサイト設定から、そのサイトのカメラ権限を「許可」に戻して再読み込みします。

LINE、X、Instagramなどのアプリ内ブラウザでは、カメラや動画再生が不安定になることがあります。問題がある場合はSafariで開き直してください。

## Androidで確認する

1. HTTPSの公開URLをChromeで開きます。
2. 表示された確認でカメラの利用を許可します。
3. 拒否した場合は、Chromeのサイト設定からカメラ権限を許可して再読み込みします。

アプリ内ブラウザで問題がある場合はChromeで開き直してください。

## よくある問題

### カメラが起動しない

- HTTPSのURLで開いているか確認します。
- Safari / Chromeのサイト別カメラ権限を確認します。
- ほかのアプリがカメラを使用している場合は閉じます。
- アプリ内ブラウザではなくSafariまたはChromeで開きます。

### カードを認識しない

- `target.jpg` と印刷物が同じか確認します。
- `target.jpg` を変更した後に `target.mind` を作り直したか確認します。
- 明るい場所で、反射を避けて映します。
- カード全体を枠内に入れ、ピントが合う距離まで離します。
- 特徴点の少ない画像は別の画像へ変更します。

### 動画が表示されない

- `public/assets/movie.mp4` が存在するか確認します。
- H.264のMP4へ変換します。
- `public/assets/movie.mp4` をブラウザで直接開き、動画単体が再生できるか確認します。
- モバイル向けに720p程度まで圧縮します。

### 音声が出ない

初期状態は仕様どおり音声OFFです。「音声OFF」ボタンを押してONへ切り替えます。ブラウザが音声付き再生を止めた場合は、表示される案内をタップしてください。

## プライバシー

カメラ映像はブラウザ上で処理し、保存・録画・外部サーバーへの送信を行いません。アクセス解析も実装していません。

## ライセンス

- MindAR 1.2.5: MIT License
- Three.js 0.160.0: MIT License
- React / Next.js / vinextなど: 各パッケージのライセンスを参照

MindARのライセンス原文は[公式リポジトリ](https://github.com/hiukim/mind-ar-js/blob/master/LICENSE)を確認してください。商用公開前には、ライブラリだけでなく、動画、写真、人物、音源、フォントなどすべての素材について利用権・肖像権・音源権利を確認してください。

## 現時点の制約

- 1種類の画像ターゲットと1本の動画だけに対応しています。
- 複数カードの同時認識には対応していません。
- LINE、X、Instagramなどのアプリ内ブラウザは正式対応外です。
- 実機のカメラ画質、印刷紙、光沢、照明によって認識精度が変わります。
- iPhone Safari / Android Chromeでの最終実機確認と、実際に印刷するチェキの寸法に合わせた位置調整が必要です。
