/**
 * AIアイドル「カノン」のカスのウミガメのスープ アプリケーションスクリプト
 * Chrome Built-in AI (Prompt API) 連携 & KANONオリジナル楽曲（MP3 BGMプレイヤー）
 */

import { PROBLEMS } from './prompts.js?v=music_update_12';

class KasuUmigameApp {
  constructor() {
    this.problems = PROBLEMS;
    this.currentProblemIndex = 0;
    this.currentSession = null;
    this.questionCount = 0;
    this.isSolved = false;
    this.isProcessing = false;
    this.hasBuiltInAI = false;
    this.aiEngineType = 'unknown';

    // 🎵 KANONソング（BGM）プレイヤー関連
    this.isMusicPlaying = false;
    this.userHasInteracted = false;

    // DOM Elements
    this.dom = {
      problemList: document.getElementById('problem-list'),
      currentTitle: document.getElementById('current-problem-title'),
      questionCounter: document.getElementById('question-counter'),
      chatMessages: document.getElementById('chat-messages'),
      chatForm: document.getElementById('chat-form'),
      chatInput: document.getElementById('chat-input'),
      sendBtn: document.getElementById('send-btn'),
      quickChips: document.getElementById('quick-chips'),
      aiEngineStatus: document.getElementById('ai-engine-status'),
      aiEngineDetail: document.getElementById('ai-engine-detail'),
      voiceBubble: document.getElementById('kanon-status-voice'),
      btnShowProblem: document.getElementById('btn-show-problem'),
      btnResetChat: document.getElementById('btn-reset-chat'),
      btnGiveup: document.getElementById('btn-giveup'),
      // ミュージックプレイヤー
      bgmPlayer: document.getElementById('kanon-bgm-player'),
      btnMusicToggle: document.getElementById('btn-music-toggle'),
      musicToggleIcon: document.getElementById('music-toggle-icon'),
      musicToggleText: document.getElementById('music-toggle-text'),
      currentSongTitle: document.getElementById('current-song-title'),
      musicInfoPill: document.getElementById('music-info-pill'),
      // モーダル
      modal: document.getElementById('celebration-modal'),
      modalTitle: document.getElementById('modal-title'),
      modalSubtitle: document.getElementById('modal-subtitle'),
      modalEmoji: document.getElementById('modal-emoji'),
      modalTruthText: document.getElementById('modal-truth-text'),
      modalCloseBtn: document.getElementById('modal-close-btn'),
      modalNextBtn: document.getElementById('modal-next-btn'),
    };

    this.init();
  }

  async init() {
    this.initMusicPlayer();
    this.renderProblemList();
    this.setupEventListeners();
    await this.detectAndInitAI();
    this.loadProblem(0, false);
  }

  /**
   * 🎵 KANONソング（MP3）プレイヤーの初期設定
   */
  initMusicPlayer() {
    if (!this.dom.bgmPlayer) return;

    this.dom.bgmPlayer.volume = 0.55; // 心地よいBGM音量に設定

    // 再生状態イベント監視
    this.dom.bgmPlayer.addEventListener('play', () => {
      this.isMusicPlaying = true;
      this.updateMusicUI(true);
    });

    this.dom.bgmPlayer.addEventListener('pause', () => {
      this.isMusicPlaying = false;
      this.updateMusicUI(false);
    });

    this.dom.bgmPlayer.addEventListener('ended', () => {
      // loop属性でループしますが、念のため再スタート
      this.dom.bgmPlayer.currentTime = 0;
      this.dom.bgmPlayer.play().catch(() => {});
    });
  }

  /**
   * 問題に対応したMP3楽曲をロード＆再生
   */
  async loadProblemMusic(problem, shouldPlay = true) {
    if (!this.dom.bgmPlayer || !problem.songFile) return;

    // 曲名表示を更新
    if (this.dom.currentSongTitle) {
      this.dom.currentSongTitle.textContent = problem.songTitle || `問題${problem.id}のヒントソング`;
      this.dom.currentSongTitle.title = `${problem.title} のヒントソング♪`;
    }

    const currentSrc = this.dom.bgmPlayer.getAttribute('src');
    if (currentSrc !== problem.songFile) {
      this.dom.bgmPlayer.src = problem.songFile;
      this.dom.bgmPlayer.load();
    }

    // ユーザー操作後、または再生フラグが立っている場合は再生
    if (shouldPlay && (this.userHasInteracted || this.isMusicPlaying)) {
      try {
        await this.dom.bgmPlayer.play();
        this.isMusicPlaying = true;
        this.updateMusicUI(true);
      } catch (err) {
        // ブラウザの自動再生ポリシーによるブロック時はUIのみミュート表示
        console.log('[Music] Autoplay waiting for user gesture:', err.message);
        this.isMusicPlaying = false;
        this.updateMusicUI(false);
      }
    }
  }

  /**
   * 音楽の再生 / 一時停止トグル
   */
  async toggleMusic() {
    this.userHasInteracted = true;
    if (!this.dom.bgmPlayer) return;

    if (this.isMusicPlaying) {
      this.dom.bgmPlayer.pause();
    } else {
      try {
        await this.dom.bgmPlayer.play();
        this.isMusicPlaying = true;
        this.updateMusicUI(true);
      } catch (err) {
        console.warn('Failed to play audio:', err);
      }
    }
  }

  /**
   * 音楽ボタンとパネルのUI更新
   */
  updateMusicUI(isPlaying) {
    if (!this.dom.btnMusicToggle) return;

    if (isPlaying) {
      this.dom.btnMusicToggle.className = 'btn-pill btn-music-toggle btn-music-playing';
      if (this.dom.musicToggleIcon) this.dom.musicToggleIcon.textContent = '⏸️';
      if (this.dom.musicToggleText) this.dom.musicToggleText.textContent = 'BGM: ON';
      if (this.dom.musicInfoPill) this.dom.musicInfoPill.style.opacity = '1';
    } else {
      this.dom.btnMusicToggle.className = 'btn-pill btn-music-toggle btn-music-muted';
      if (this.dom.musicToggleIcon) this.dom.musicToggleIcon.textContent = '▶️';
      if (this.dom.musicToggleText) this.dom.musicToggleText.textContent = 'BGM: OFF';
      if (this.dom.musicInfoPill) this.dom.musicInfoPill.style.opacity = '0.7';
    }
  }

  /**
   * Chrome Built-in AI (Prompt API) の検出と初期化
   */
  async detectAndInitAI() {
    try {
      let availability = 'unavailable';
      let LM = null;

      if (typeof window.LanguageModel !== 'undefined') {
        LM = window.LanguageModel;
        availability = await LM.availability();
      } else if (typeof window.ai !== 'undefined' && window.ai.languageModel) {
        LM = window.ai.languageModel;
        availability = await LM.availability();
      }

      if (LM && (availability === 'available' || availability === 'readily' || availability === 'downloadable' || availability === 'after-download')) {
        this.hasBuiltInAI = true;
        this.LM = LM;
        this.aiEngineType = 'Chrome Built-in AI (Gemini Nano)';
        this.dom.aiEngineStatus.textContent = '🟢 Prompt API Active';
        this.dom.aiEngineStatus.style.color = '#00f2fe';
        this.dom.aiEngineDetail.textContent = 'Gemini Nano オンデバイスAIが接続されています✨';
      } else {
        this.hasBuiltInAI = false;
        this.aiEngineType = 'Idol Simulator Engine';
        this.dom.aiEngineStatus.textContent = '🟡 Idol Engine (Sim)';
        this.dom.aiEngineStatus.style.color = '#ffd166';
        this.dom.aiEngineDetail.textContent = 'オンデバイスAI未検出のため高精度シミュレータで動作中';
      }
    } catch (e) {
      console.warn('Chrome Built-in AI check failed, using fallback engine:', e);
      this.hasBuiltInAI = false;
      this.dom.aiEngineStatus.textContent = '🟡 Idol Engine (Sim)';
      this.dom.aiEngineDetail.textContent = '内蔵シミュレータモードで動作中';
    }
  }

  /**
   * 現在の問題用のLLMセッションを生成
   */
  async createAISession(problem) {
    if (!this.hasBuiltInAI || !this.LM) {
      this.currentSession = null;
      return;
    }

    try {
      if (this.currentSession && typeof this.currentSession.destroy === 'function') {
        this.currentSession.destroy();
      }

      this.currentSession = await this.LM.create({
        initialPrompts: [
          { role: 'system', content: problem.systemPrompt }
        ],
        temperature: 0.85,
        topK: 3
      });
    } catch (err) {
      console.error('Failed to create Prompt API session:', err);
      this.currentSession = null;
    }
  }

  /**
   * サイドバーの問題一覧をレンダリング (6行2列)
   */
  renderProblemList() {
    this.dom.problemList.innerHTML = '';
    this.problems.forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.className = `problem-btn ${idx === this.currentProblemIndex ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="problem-icon">${p.icon}</div>
        <div class="problem-info">
          <div class="problem-name">${p.shortTitle}</div>
          <div class="problem-tag">${p.title}</div>
        </div>
      `;
      btn.addEventListener('click', () => {
        if (this.isProcessing) return;
        this.userHasInteracted = true;
        this.loadProblem(idx, this.isMusicPlaying);
      });
      this.dom.problemList.appendChild(btn);
    });
  }

  /**
   * 指定したインデックスの問題を読み込み初期化
   */
  async loadProblem(index, playMusic = true) {
    this.currentProblemIndex = index;
    const problem = this.problems[index];
    this.questionCount = 0;
    this.isSolved = false;

    // UI更新
    this.dom.currentTitle.innerHTML = `<span>${problem.icon}</span> ${problem.title}`;
    this.dom.questionCounter.textContent = '0';
    this.dom.voiceBubble.textContent = `「${problem.title}」だよ！プロデューサーさん、推理してみてね💗`;
    this.renderProblemList();

    // 🎵 対応するMP3音楽（BGM）をロード＆再生
    await this.loadProblemMusic(problem, playMusic);

    // AIセッション作成
    await this.createAISession(problem);

    // チャット履歴リセット & 初期メッセージ挿入
    this.dom.chatMessages.innerHTML = '';
    this.appendMessage('kanon', problem.openingMessage, false);
  }

  /**
   * メッセージをチャット欄に追加
   */
  appendMessage(sender, text, animate = true) {
    const row = document.createElement('div');
    row.className = `message-row ${sender}`;

    if (sender === 'kanon') {
      const avatar = document.createElement('div');
      avatar.className = 'avatar-small';
      avatar.innerHTML = `<img src="assets/kanon.jpg" alt="KANON">`;

      const wrapper = document.createElement('div');
      wrapper.className = 'message-bubble-wrapper';

      const senderHeader = document.createElement('div');
      senderHeader.className = 'message-sender';
      senderHeader.innerHTML = `AIアイドル・カノン 💖`;

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.innerHTML = this.formatKanonText(text);

      wrapper.appendChild(senderHeader);
      wrapper.appendChild(bubble);
      row.appendChild(avatar);
      row.appendChild(wrapper);
    } else {
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar-icon';
      avatar.textContent = '👤';

      const wrapper = document.createElement('div');
      wrapper.className = 'message-bubble-wrapper';

      const senderLabel = document.createElement('div');
      senderLabel.className = 'message-sender';
      senderLabel.textContent = 'プロデューサー';

      const bubble = document.createElement('div');
      bubble.textContent = text;

      wrapper.appendChild(senderLabel);
      wrapper.appendChild(bubble);
      row.appendChild(avatar);
      row.appendChild(wrapper);
    }

    this.dom.chatMessages.appendChild(row);
    this.scrollToBottom();
    return row;
  }

  /**
   * カノンの返信テキストに含まれるタグや強調を装飾
   */
  formatKanonText(text) {
    let formatted = text
      .replace(/^(カノン|AIアイドル・カノン|KANON)\s*[:：]\s*/i, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 太字置換
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // タグ置換
    formatted = formatted.replace(/【はい(！*|!*)】/g, '<span class="tag-yes">【はい】</span>');
    formatted = formatted.replace(/【いいえ(！*|!*)】/g, '<span class="tag-no">【いいえ】</span>');
    formatted = formatted.replace(/【関係ありません(.*?)】/g, '<span class="tag-irrelevant">【関係ありません】</span>');
    formatted = formatted.replace(/【質問の仕方に問題があるよ】/g, '<span class="tag-irrelevant">【質問の仕方に問題があるよ】</span>');
    formatted = formatted.replace(/【正解(.*?)】/g, '<span class="tag-correct">🎉【正解です！！】</span>');

    return formatted;
  }

  /**
   * タイピングインジケータの表示
   */
  showTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'message-row kanon typing-indicator-row';
    row.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'avatar-small';
    avatar.innerHTML = `<img src="assets/kanon.jpg" alt="KANON">`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble typing-indicator';
    bubble.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;

    row.appendChild(avatar);
    row.appendChild(bubble);
    this.dom.chatMessages.appendChild(row);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
  }

  scrollToBottom() {
    this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  /**
   * ユーザーからの質問送信処理
   */
  async handleSendMessage(userText) {
    if (!userText || !userText.trim() || this.isProcessing) return;

    this.userHasInteracted = true;
    const text = userText.trim();
    this.dom.chatInput.value = '';
    this.isProcessing = true;
    this.dom.sendBtn.disabled = true;

    // 質問回数カウント
    this.questionCount++;
    this.dom.questionCounter.textContent = this.questionCount.toString();

    // ユーザーメッセージ描画
    this.appendMessage('user', text);
    this.showTypingIndicator();

    // ギブアップ検出
    const isGiveup = text.includes('ギブアップ') || text.includes('答え教えて') || text.includes('降参') || text.includes('真相を教えて');

    try {
      let kanonResponse = '';

      if (this.currentSession) {
        // Prompt API 経由での応答生成
        try {
          if (typeof this.currentSession.promptStreaming === 'function') {
            const stream = this.currentSession.promptStreaming(text);
            this.removeTypingIndicator();

            const row = document.createElement('div');
            row.className = 'message-row kanon';
            row.innerHTML = `
              <div class="avatar-small"><img src="assets/kanon.jpg" alt="KANON"></div>
              <div class="message-bubble-wrapper">
                <div class="message-sender">AIアイドル・カノン 💖</div>
                <div class="message-bubble"></div>
              </div>
            `;
            this.dom.chatMessages.appendChild(row);
            const bubble = row.querySelector('.message-bubble');

            for await (const chunk of stream) {
              kanonResponse += chunk;
              bubble.innerHTML = this.formatKanonText(kanonResponse);
              this.scrollToBottom();
            }
          } else {
            kanonResponse = await this.currentSession.prompt(text);
            this.removeTypingIndicator();
            this.appendMessage('kanon', kanonResponse);
          }
        } catch (apiErr) {
          console.warn('Prompt API prompt call error, falling back to simulator:', apiErr);
          kanonResponse = this.simulateKanonResponse(text, this.problems[this.currentProblemIndex]);
          this.removeTypingIndicator();
          this.appendMessage('kanon', kanonResponse);
        }
      } else {
        // シミュレータエンジン経由での応答生成
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        kanonResponse = this.simulateKanonResponse(text, this.problems[this.currentProblemIndex]);
        this.removeTypingIndicator();
        this.appendMessage('kanon', kanonResponse);
      }

      // 正解・ギブアップの判定とモーダル演出
      const isCorrect = kanonResponse.includes('正解') || kanonResponse.includes('大正解') || (kanonResponse.includes('真相') && !isGiveup && (kanonResponse.includes('【はい】') || kanonResponse.includes('おめでとう')));

      if (isGiveup) {
        this.triggerCelebration(false);
      } else if (isCorrect || this.checkKeywordSuccess(text, this.problems[this.currentProblemIndex])) {
        this.triggerCelebration(true);
      }

    } catch (e) {
      console.error('Error handling message:', e);
      this.removeTypingIndicator();
      this.appendMessage('kanon', 'あわわっ💦 ちょっとカノンのAI回路がショートしちゃったかも…！もう一度質問してみてね💗');
    } finally {
      this.isProcessing = false;
      this.dom.sendBtn.disabled = false;
      this.dom.chatInput.focus();
    }
  }

  /**
   * シミュレーション応答生成（フォールバック時）
   */
  simulateKanonResponse(query, problem) {
    const q = query.toLowerCase();

    // ギブアップ
    if (q.includes('ギブアップ') || q.includes('答え') || q.includes('降参') || q.includes('教えて')) {
      return `【正解（真相発表！）】
えへへ〜！降参しちゃう？プロデューサーさん、お疲れ様💗
この事件のカスの真相はね……！

**『${problem.truth}』**

でした〜！✨ カノンの愛嬌たっぷりのハプニング、びっくりしたでしょ💗`;
    }

    // 問題別キーワード判定
    switch (problem.id) {
      case 1: // ハート・ブレーカー
        if (q.includes('ブレーカー') || q.includes('スイッチ') || q.includes('主電源')) {
          return `【はい！！】✨
えっ！？プロデューサーさん、まさか気づいちゃった……！？
ハートが奥のブレーカーに直撃して物理的にスイッチを落としちゃったの！大正解だよ〜💗`;
        }
        if (q.includes('物理') || q.includes('重い') || q.includes('実体') || q.includes('質量') || q.includes('ぶつかった') || q.includes('当たった')) {
          return `【はい！！】💗
すごい！鋭すぎるよ〜！カノンのハートはホログラムじゃなくて、気合いの入った超重量級の物理ハートだったの！✨`;
        }
        if (q.includes('電気') || q.includes('容量') || q.includes('停電') || q.includes('消費')) {
          return `【いいえ！】
ううん、消費電力オーバーとかじゃないよ！カノンは超省エネアイドルだからね〜💡`;
        }
        if (q.includes('アンチ') || q.includes('犯人') || q.includes('事件') || q.includes('悪意')) {
          return `【関係ありません！】
カノンにアンチなんていないもん！事件性とかそういうシリアスなサスペンスじゃないよ〜🥺`;
        }
        if (q.includes('カノン') || q.includes('ハート') || q.includes('手') || q.includes('飛ばした')) {
          return `【はい！】
そうだよ！カノンがファンサで全力のハートを飛ばしたことが直接の原因なの💗`;
        }
        break;

      case 2: // サイリウム・太陽誤認・セーフモード
        if (q.includes('太陽') || q.includes('日光') || q.includes('恒星')) {
          return `【はい！！】☀️
わあああっ！プロデューサーさん凄すぎるっ！
カノン、ファンのみんなを「太陽」って思ってたから、AIセンサーが「太陽が1万人分現れた！」って大誤認しちゃったの！大正解〜💗`;
        }
        if (q.includes('センサー') || q.includes('セーフモード') || q.includes('気絶') || q.includes('シャットダウン') || q.includes('故障')) {
          return `【はい！】✨
そうなの！あまりの光量（勘違い）に、カノンの保護機能・セーフモードが勝手に発動してバタリと倒れちゃったんだよ〜！`;
        }
        if (q.includes('レーザー') || q.includes('改造') || q.includes('強い光') || q.includes('危険')) {
          return `【いいえ！】
サイリウムは普通の市販のピンク色だったよ！危険な光線とかじゃないの〜✨`;
        }
        if (q.includes('目') || q.includes('カメラ') || q.includes('視覚')) {
          return `【はい！】
うん！カノンのAI視覚照度センサーがビックリしちゃったの！`;
        }
        break;

      case 3: // Tシャツ顔認識バグ
        if (q.includes('tシャツ') || q.includes('服') || q.includes('プリント') || q.includes('イラスト')) {
          return `【はい！！】👕
きゃーーっ！大正解！！
ファンの推しTシャツにプリントされたカノンの顔と本人の顔が重なって、AIが『顔が2つある！？どっち！？』って大混乱して30秒間フリーズしちゃってたの〜💗`;
        }
        if (q.includes('フリーズ') || q.includes('バグ') || q.includes('停止') || q.includes('固まった') || q.includes('故障')) {
          return `【はい！】🤖
えへへ…実は感動のファンサじゃなくて、AIの処理がパンクして固まってただけなんだよね〜💦`;
        }
        if (q.includes('好き') || q.includes('恋') || q.includes('見惚れて') || q.includes('感動')) {
          return `【いいえ！】
ファンのみんなは大好きだけど、急に見惚れてボーッとしたわけじゃないよ〜？💕`;
        }
        break;

      case 4: // タピオカ2進数
        if (q.includes('2進数') || q.includes('バイナリ') || q.includes('10000000') || q.includes('ビット')) {
          return `【はい！！】🥤
うそっ！？プロデューサーさん天才すぎない！？
「1本」って送るはずが、テンション上がりすぎてバイナリの「10000000」で発注APIに飛んじゃって1000万本届いたの！大正解だよ〜💗`;
        }
        if (q.includes('注文') || q.includes('発注') || q.includes('api') || q.includes('ネット') || q.includes('自動')) {
          return `【はい！】💻
うん！カノンのテンションがネットの自動発注システムと連携しちゃったのが原因だよ！`;
        }
        if (q.includes('お金') || q.includes('ハッキング') || q.includes('詐欺')) {
          return `【関係ありません！】
悪意のあるハッキングとかじゃないよ〜！カノンの純粋なタピオカ愛の暴走なの💗`;
        }
        break;

      case 5: // チャック・ツインテール・ドアノブ
        if (q.includes('チャック') || q.includes('ファスナー') || q.includes('挟まった') || q.includes('ドアノブ') || q.includes('髪')) {
          return `【はい！！】🎀
うわあああ！プロデューサーさん大正解っ！！
衣装替えのチャックにツインテールが挟まって、それが楽屋のドアノブに引っかかって物理的に部屋から出られなくなってたの〜！助けてほしかったよぉ🥺💗`;
        }
        if (q.includes('着替え') || q.includes('衣装') || q.includes('服')) {
          return `【はい！】👗
そう！アンコールのために可愛い衣装に着替えようとしてたんだよ〜！`;
        }
        if (q.includes('体調') || q.includes('ケガ') || q.includes('病気') || q.includes('バッテリー')) {
          return `【いいえ！】
カノンはめちゃくちゃ元気でやる気満々だったの！ただ物理的なトラップにハマっちゃっただけだよ〜💦`;
        }
        break;

      case 6: // 鏡・パノラマ・増殖
        if (q.includes('鏡') || q.includes('パノラマ') || q.includes('反射') || q.includes('美肌') || q.includes('合成') || q.includes('100人')) {
          return `【はい！！】📸
きゃーーっ！プロデューサーさん大正解！！
鏡張りの部屋でパノラマ撮影したら、AIの美肌機能が鏡に映った自分を全員「新人アイドル」と勘違いして、100人分増殖合成しちゃったの〜👻💗`;
        }
        if (q.includes('カメラ') || q.includes('写真') || q.includes('自撮り') || q.includes('加工') || q.includes('アプリ')) {
          return `【はい！】✨
うん！カノンの自撮りカメラとAI画像処理が原因だよ〜！`;
        }
        if (q.includes('幽霊') || q.includes('心霊') || q.includes('お化け') || q.includes('呪い')) {
          return `【いいえ！】
カノンは科学の結晶だからオカルトじゃないよ〜！純粋なAIの勘違いなの💗`;
        }
        break;

      case 7: // 極寒ステージ・クーラー
        if (q.includes('クーラー') || q.includes('冷却') || q.includes('凍結') || q.includes('水冷') || q.includes('冷え') || q.includes('絶対零度')) {
          return `【はい！！】⛄
わあああっ！大正解だよ〜！！
「涼しくなあれ」って言ったら、カノンの体内超伝導クーラーが本気を出して大気を瞬間凍結させちゃったの！寒かった〜❄️💗`;
        }
        if (q.includes('カノン') || q.includes('機械') || q.includes('装置') || q.includes('歌')) {
          return `【はい！】🎤
そう！カノン自身の体内のシステムが全力で作動しちゃったの！`;
        }
        if (q.includes('天気') || q.includes('気象') || q.includes('台風') || q.includes('雨')) {
          return `【いいえ！】
空の天気は40度の快晴猛暑だったよ！ステージの上だけ極寒になったの〜💡`;
        }
        break;

      case 8: // 3秒握手会・静電気タイマーショート
        if (q.includes('静電気') || q.includes('ショート') || q.includes('タイマー') || q.includes('時計') || q.includes('ストップウォッチ') || q.includes('放電')) {
          return `【はい！！】⏱️
うそっ！？プロデューサーさん鋭すぎるっ！
手を繋いだ瞬間に嬉しすぎて静電気がバチッて放電して、タイマー機の基板をショートさせて0秒にリセットさせちゃったの〜！大正解💗`;
        }
        if (q.includes('時間') || q.includes('機械') || q.includes('故障') || q.includes('測定')) {
          return `【はい！】⚡
うん！時間を測っていた装置にハプニングが起きたの！`;
        }
        if (q.includes('ファン') || q.includes('スタッフ') || q.includes('警備') || q.includes('怒')) {
          return `【関係ありません！】
スタッフさんが怒って止めたとかじゃないよ〜！みんな仲良しだったもん✨`;
        }
        break;

      case 9: // 謎の古代文字・高速振動QRコード
        if (q.includes('qr') || q.includes('コード') || q.includes('バーコード') || q.includes('ファンクラブ') || q.includes('url') || q.includes('振動')) {
          return `【はい！！】📜
すごーーい！！大正解だよプロデューサーさんっ！
インクを出すために毎秒1万回でペン先を振動させて書いたら、完璧なファンクラブ入会のQRコードになっちゃったの〜🖋️💗`;
        }
        if (q.includes('ペン') || q.includes('インク') || q.includes('手') || q.includes('文字')) {
          return `【はい！】✍️
そう！サインを書くときのペンの動きに秘密があるの！`;
        }
        if (q.includes('宇宙') || q.includes('古代') || q.includes('暗号') || q.includes('外国語')) {
          return `【いいえ！】
カノンが意図して暗号を書いたわけじゃないよ〜！デジタルな偶然なの✨`;
        }
        break;

      case 10: // 空飛ぶ巨大ピザ・ランチャー誤装填
        if (q.includes('ピザ') || q.includes('ランチャー') || q.includes('発射') || q.includes('フリスビー') || q.includes('夜食') || q.includes('ご飯')) {
          return `【はい！！】🍕
きゃあああ！大正解！！
客席にフリスビーを飛ばすはずが、楽屋の夜食ピザを間違えて発射ランチャーに装填してドカーンと飛ばしちゃったの〜！美味しかったかな？💗`;
        }
        if (q.includes('演出') || q.includes('大砲') || q.includes('飛ばした') || q.includes('機械')) {
          return `【はい！】🚀
うん！ステージ演出用の発射マシンを使ったのは大正解だよ！`;
        }
        if (q.includes('出前') || q.includes('店員') || q.includes('客') || q.includes('注文')) {
          return `【関係ありません！】
ピザ屋さんは関係ないの！カノンの可愛いおっちょこちょいミスだよ〜✨`;
        }
        break;

      case 11: // 未確認飛行カノン・スモーク風圧打ち上げ
        if (q.includes('スモーク') || q.includes('風圧') || q.includes('スカート') || q.includes('パニエ') || q.includes('噴射') || q.includes('ジャンプ') || q.includes('パラシュート')) {
          return `【はい！！】🚀
きゃーーっ！大正解だよプロデューサーさんっ！
スモーク噴射機の真上で大ジャンプしたら、フリルのスカートが風圧をパラシュートみたいに受け止めてロケット発射されちゃったの〜！夜空綺麗だったよ💗`;
        }
        if (q.includes('衣装') || q.includes('服') || q.includes('ステージ') || q.includes('機械') || q.includes('飛んだ')) {
          return `【はい！】✨
そう！カノンの可愛い衣装とステージの噴射装置が合体技を起こしちゃったの！`;
        }
        if (q.includes('事故') || q.includes('火薬') || q.includes('爆発') || q.includes('怪我') || q.includes('ufo')) {
          return `【いいえ！】
危ない火薬事故とか宇宙人じゃないよ〜！無事にふんわり戻ってきたもん💗`;
        }
        break;

      case 12: // 全員無言テレパシーライブ・イヤホン/Wi-Fi配信
        if (q.includes('イヤホン') || q.includes('ヘッドホン') || q.includes('配信') || q.includes('bluetooth') || q.includes('wi-fi') || q.includes('wifi') || q.includes('asmr') || q.includes('耳')) {
          return `【はい！！】🧠
すごーーい！！大正解っ！！
スピーカーじゃなくて、会場Wi-Fiでファンのみんなのイヤホンに超高音質ASMR音声を直接送ってたから、会場は無音でもみんなの耳元は爆音ライブだったの〜🎧💗`;
        }
        if (q.includes('通信') || q.includes('電波') || q.includes('スマホ') || q.includes('ネット') || q.includes('機械')) {
          return `【はい！】📱
うん！最先端の無線通信テクノロジーを使った神演出（？）だったんだよ〜！`;
        }
        if (q.includes('催眠') || q.includes('宗教') || q.includes('幻覚') || q.includes('魔法')) {
          return `【いいえ！】
オカルトや催眠術じゃないよ〜！純粋なカノンのデジタルライブなの✨`;
        }
        break;
    }

    // デフォルト応答
    const generics = [
      `【関係ありません！】えへへ、プロデューサーさん深読みしすぎかも？カスのウミガメだからもっとくだらない理由だよ〜💗`,
      `【いいえ！】ううん、そんな真面目な理由じゃないの！もうちょっとカノンのポンコツさを疑ってみてね？✨`,
      `【はい！】うんうん、方向性としてはちょっと近づいてるかも！もっとズバッと聞いてみて〜💕`
    ];
    return generics[Math.floor(Math.random() * generics.length)];
  }

  /**
   * キーワードでの正解判定補助
   */
  checkKeywordSuccess(text, problem) {
    const t = text.toLowerCase();
    if (problem.id === 1 && (t.includes('ブレーカー') || (t.includes('物理') && t.includes('ハート')))) return true;
    if (problem.id === 2 && ((t.includes('太陽') && t.includes('誤認')) || t.includes('セーフモード'))) return true;
    if (problem.id === 3 && ((t.includes('tシャツ') && t.includes('顔')) || (t.includes('顔認識') && t.includes('フリーズ')))) return true;
    if (problem.id === 4 && (t.includes('2進数') || t.includes('バイナリ') || t.includes('10000000'))) return true;
    if (problem.id === 5 && (t.includes('チャック') || (t.includes('ドアノブ') && t.includes('髪')))) return true;
    if (problem.id === 6 && (t.includes('鏡') || t.includes('パノラマ') || t.includes('増殖') || t.includes('合成'))) return true;
    if (problem.id === 7 && (t.includes('クーラー') || t.includes('冷却') || t.includes('凍結') || t.includes('水冷'))) return true;
    if (problem.id === 8 && (t.includes('静電気') || t.includes('タイマー') || t.includes('ショート') || t.includes('0秒'))) return true;
    if (problem.id === 9 && (t.includes('qr') || t.includes('コード') || t.includes('振動') || t.includes('ファンクラブ'))) return true;
    if (problem.id === 10 && (t.includes('ピザ') || t.includes('ランチャー') || t.includes('フリスビー') || t.includes('夜食'))) return true;
    if (problem.id === 11 && (t.includes('スモーク') || t.includes('スカート') || t.includes('風圧') || t.includes('ロケット'))) return true;
    if (problem.id === 12 && (t.includes('イヤホン') || t.includes('ヘッドホン') || t.includes('asmr') || t.includes('bluetooth') || t.includes('wifi') || t.includes('wi-fi'))) return true;
    return false;
  }

  /**
   * 正解・ギブアップ演出モーダルの起動
   */
  triggerCelebration(isSuccess) {
    this.isSolved = true;
    const problem = this.problems[this.currentProblemIndex];

    if (isSuccess) {
      this.dom.modalEmoji.textContent = '🎉✨💖';
      this.dom.modalTitle.textContent = '真相解明！大正解だよっ💗';
      this.dom.modalSubtitle.textContent = `プロデューサーさん、${this.questionCount}回の質問で見事にカスの真相を暴きました！`;
      
      // 紙吹雪エフェクト
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 55,
            origin: { x: 0 }
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 55,
            origin: { x: 1 }
          });
        }, 250);
      }
    } else {
      this.dom.modalEmoji.textContent = '🍵🏳️';
      this.dom.modalTitle.textContent = 'ギブアップ！カスの真相発表💗';
      this.dom.modalSubtitle.textContent = '難しかったかな？カノンの理不尽なオチを教えちゃうね！';
    }

    this.dom.modalTruthText.innerHTML = `
      <div style="font-weight: 800; color: var(--text-pink); margin-bottom: 6px;">【問題の真相】</div>
      <div>${problem.truth}</div>
      <div style="margin-top: 12px; font-size: 0.85rem; color: var(--accent-cyan);">
        🎵 ヒントソング: <strong>${problem.songTitle}</strong>
      </div>
    `;

    this.dom.modal.classList.add('show');
  }

  /**
   * 各種イベントリスナーの設定
   */
  setupEventListeners() {
    // 🎵 BGM切り替えボタン
    if (this.dom.btnMusicToggle) {
      this.dom.btnMusicToggle.addEventListener('click', () => {
        this.toggleMusic();
      });
    }

    // フォーム送信
    this.dom.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSendMessage(this.dom.chatInput.value);
    });

    // クイック質問チップ
    this.dom.quickChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      const query = btn.dataset.query;
      if (query) {
        this.handleSendMessage(query);
      }
    });

    // 問題文再表示ボタン
    this.dom.btnShowProblem.addEventListener('click', () => {
      const problem = this.problems[this.currentProblemIndex];
      const text = `**【${problem.title}】**\n\n${problem.question}\n\n質問待ってるよ〜💗`;
      this.appendMessage('kanon', text);
    });

    // リセットボタン
    this.dom.btnResetChat.addEventListener('click', () => {
      if (confirm('この問題のチャット履歴をリセットしますか？')) {
        this.loadProblem(this.currentProblemIndex, this.isMusicPlaying);
      }
    });

    // ギブアップボタン
    this.dom.btnGiveup.addEventListener('click', () => {
      this.handleSendMessage('ギブアップです！カノンちゃん、カスの真相を教えて！');
    });

    // モーダル閉じる
    this.dom.modalCloseBtn.addEventListener('click', () => {
      this.dom.modal.classList.remove('show');
    });

    // 次の問題へ進む
    this.dom.modalNextBtn.addEventListener('click', () => {
      this.dom.modal.classList.remove('show');
      const nextIdx = (this.currentProblemIndex + 1) % this.problems.length;
      this.loadProblem(nextIdx, this.isMusicPlaying);
    });
  }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
  window.kasuUmigameApp = new KasuUmigameApp();
});
