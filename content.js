
// content.js (1.5.50) — HTML→Markdown conversion for Obsidian-friendly content
(function() {
  const VERSION = "1.5.50";
  const STATE_KEY = "__gptToObsidianSaverState";
  const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {});
  state.generation = (state.generation || 0) + 1;
  state.recentSaves = state.recentSaves || new Map();
  state.activeSaves = state.activeSaves || new Set();
  state.activeVisualizeAttempts = state.activeVisualizeAttempts || new Set();
  const generation = state.generation;
  const DEBUG = false;
  const ARTIFACT_DEBUG = false;
  const MAX_HTML_ATTACHMENT_CHARS = 700000;
  const MAX_GENERATED_MARKDOWN_CHARS = 2000000;
  const GENERATED_MARKDOWN_VIEWER_TIMEOUT_MS = 90000;
  const GENERATED_MARKDOWN_VIEWER_POLL_MS = 150;
  const GENERATED_MARKDOWN_AMBIGUITY_STABILITY_MS = 1200;
  const RUNTIME_POLL_INTERVAL_MS = 1000;
  const RUNTIME_PING_TIMEOUT_MS = 1500;
  const RUNTIME_PING_TYPE = "gpt2obs-runtime-ping";
  const NATIVE_PREFLIGHT_TYPE = "gpt2obs-native-preflight";
  const CLIPBOARD_PERMISSION_REQUEST_TYPE = "gpt2obs-request-clipboard-read-permission";
  const NATIVE_PREFLIGHT_TIMEOUT_MS = 2500;
  const DETAILED_MARKDOWN_HEADING = "장별 상세 한국어 요약";
  const DETAILED_MARKDOWN_MARKER = "%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%";
  const MARKDOWN_OPEN_PROMPT_DELAY_MS = 800;
  const MARKDOWN_DOWNLOAD_PROMPT_DELAY_MS = 12000;
  const SHARE_DIALOG_TIMEOUT_MS = 10000;
  const SHARE_URL_TIMEOUT_MS = 15000;
  const SHARE_POLL_MS = 100;
  const VERIFIED_RESPONSE_SHARE_SURFACE_MISSING = "verified response Share surface is missing or ambiguous";
  const RESPONSE_SHARE_IFRAME_DUPLICATED = "response Share duplicated the verified A2 iframe source";
  const RESPONSE_SHARE_IFRAME_RELOCATION_MISMATCH = "response Share iframe relocation did not preserve the A2 source proof";
  const FILE_DELIVERABLE_EXTENSIONS = ["html", "htm", "md", "mm", "json", "zip"];

  const SUPPORTED_LANGUAGES = ["en", "ko"];
  const DEFAULT_LANGUAGE = "en";
  const I18N = {
    en: {
      saveButton: "Save to Obsidian",
      savingButton: "Saving…",
      untitledQuestion: "Untitled question",
      summaryTitle: "Summary title",
      questionHeading: "Question",
      answerHeading: "Answer",
      attachmentsHeading: "Attachments",
      htmlLearningHeading: "HTML Learning Material",
      originalQuestionHeading: "Original Question",
      originalAnswerHeading: "Original Answer",
      nativeSaveFailedPrefix: "Native helper save failed: ",
      nativeSaveFailedSuffix: "\nThe extension attempted to open the Markdown note through URI mode, but could not verify that Obsidian created it. HTML attachments may not have been saved.",
      nativeSaveNoFallbackSuffix: "\nThe note was not sent through URI mode because the generated Markdown is too large for a reliable URI save.",
      htmlDownloadNotAttachedWarning: "HTML file was downloaded by Chrome, but the extension could not attach it to the Obsidian note.",
      htmlDownloadCopyFailedWarning: "HTML file was downloaded by Chrome, but could not be copied into the Obsidian vault.",
      htmlArtifactCaptureFailedWarning: "The HTML artifact could not be read or downloaded, so it was not attached to the Obsidian note.",
      generatedArtifactWarningPrefix: "Some generated files could not be captured safely:\n",
      markdownOpenActionRequired: "ChatGPT requires a real click to open the detailed Markdown artifact. Close this message, then click the highlighted .md filename card once. The extension will read the opened file and continue saving automatically.",
      markdownDownloadActionRequired: "ChatGPT requires a real click to download the detailed Markdown file. Close this message, then click the highlighted File download button once. The extension will use only that current .md download and continue saving automatically.",
      htmlDownloadActionRequired: "The extension could not read the HTML source directly. Close this message, then click the small File download button on the file card once. Do not click the HTML learning material preview button. The extension will wait up to 90 seconds and then save it to Obsidian.",
      htmlAttachmentSavedLine: "HTML file saved as attachment.",
      partialArtifactSaveConfirm: "ChatGPT shows {missingCount} file deliverable(s) whose real content could not be captured.\n\nExpected HTML: {expectedHtmlCount}\nCaptured HTML: {capturedHtmlCount}\nMissing or unsupported: {missingNames}\n\nCancel stops the save (recommended). OK explicitly saves only the readable note body and any files that were actually captured.",
      partialRichArtifactSaveConfirm: "This response contains {expectedRichCount} interactive app block(s), but only {completeRichCount} complete verified copy/copies can be saved.\n\nMissing app blocks: {missingRichCount}\nMissing file deliverables: {missingFileNames}\n\nCancel creates no Obsidian note or attachment (recommended). OK explicitly saves only the readable outer text, files that were actually captured, and a permanent missing-app warning.",
      missingRichArtifactWarningTitle: "Interactive app block not saved",
      missingRichArtifactWarningBody: "The original response contained {expectedRichCount} app block(s), but no savable original or verified complete static copy was available. Only the explanation outside the app block is included below.",
      sourceFileDisplayName: "Source file display name: ",
      nativeAttachmentAuditFailed: "The native helper reported an incomplete attachment save. The note may already exist, but these requested files were not verified: ",
      visualizeShareConfirm: "To save this visualization in Obsidian, the extension will create or reuse a ChatGPT share link.\n\nIt will request the optional clipboard-read permission. After this attempt's Copy link action shows a fresh Copied confirmation, it may read the clipboard once only to validate that one ChatGPT share URL. The clipboard value is not logged, stored separately, or sent elsewhere; the validated link is written only into this Obsidian note. If permission or automatic reading is unavailable, an empty extension input will ask you to paste the link manually.\n\nDepending on the sharing settings, anyone with the link may be able to view the shared content. The visualization itself will not be copied into the Vault; it depends on an internet connection and the ChatGPT share page.\n\nCancel: do not request permission, click Share, or create a note\nOK: request permission, automate only the current visualization response's Share UI, and save the validated Visualize request context",
      visualizeConsentTitle: "Save the shared visualization",
      visualizeConsentContinue: "Continue",
      visualizeConsentCancel: "Cancel",
      visualizeShareHeading: "Visualization",
      visualizeShareOpenLink: "Open shared visualization in ChatGPT",
      directVisualizeRequestHeading: "Visualization Request",
      directVisualizeExplanationHeading: "Visualization Explanation",
      richAppShareHeading: "Interactive App",
      richAppShareOpenLink: "Open shared app in ChatGPT",
      richAppRequestHeading: "Request",
      richAppExplanationHeading: "App Explanation",
      richAppShareConfirm: "To save this interactive app in Obsidian, the extension will create or reuse a ChatGPT share link.\n\nIt will request the optional clipboard-read permission. After this attempt's Copy link action shows a fresh Copied confirmation, it may read the clipboard once only to validate that one ChatGPT share URL. The clipboard value is not logged, stored separately, or sent elsewhere; only the validated link is written into this Obsidian note. If permission or automatic reading is unavailable, an empty extension input will ask you to paste the link manually.\n\nThe app itself will not be copied into the Vault; it depends on an internet connection and the ChatGPT share page.\n\nCancel: do not request permission, click Share, or create a note\nOK: request permission, automate only the current app response's Share UI, and save the validated provider-neutral app context",
      richAppConsentTitle: "Save the shared app",
      richAppShareFailedPrefix: "Shared app save stopped at {stage}: {reason}",
      richAppReferenceWarningTitle: "Remote app reference",
      richAppReferenceWarningBody: "The interactive app is not a local file in the Vault. It depends on an internet connection and the ChatGPT share page, and may stop opening if sharing is disabled or access policies change.",
      visualizeShareReferenceWarningTitle: "Remote visualization reference",
      visualizeShareReferenceWarningBody: "The visualization is not a local file in the Vault. It depends on an internet connection and the ChatGPT share page, and may stop opening if sharing is disabled or access policies change. Depending on the sharing settings, people who know the link may be able to access it.",
      visualizeShareFailedPrefix: "Visualize share save stopped at {stage}: {reason}",
      visualizeManualShareTitle: "Paste the ChatGPT share link",
      visualizeManualShareBody: "Automatic clipboard reading was unavailable. Paste the single https://chatgpt.com/s/<share-token> or https://chatgpt.com/share/<share-token> link below. The field starts empty.",
      visualizeManualSharePlaceholder: "https://chatgpt.com/s/<share-token>",
      visualizeManualShareSave: "Use this link",
      visualizeManualShareCancel: "Cancel",
      visualizeManualShareInvalid: "Enter one valid ChatGPT share link only.",
      visualizeShareCreatedButSaveFailed: "A ChatGPT share link was created, but the Obsidian note was not saved. The share link may remain active. If needed, disable the share manually from ChatGPT; the extension will not disable it automatically.",
      visualizeShareCreateAttemptUnverified: "ChatGPT's Create link action ran, but the share URL could not be validated and the Obsidian note was not saved. A share link may remain active. Check ChatGPT's share screen and disable it manually if needed; the extension will not disable it automatically.",
      conversationShareConfirm: "The current answer does not provide an individual response-share action.\n\nIf you continue, the conversation content up to the share point may be shared, not only this visualization answer. This conversation share link will be saved in the Obsidian note.\n\nCancel: do not click Share or create a note\nOK: share the conversation and save only the validated conversation link",
      conversationShareConsentTitle: "Save a conversation share link",
      conversationShareUpdateConfirm: "An existing conversation share link may not include the current visualization. Update the share link to include the current content?",
      conversationShareHeading: "Visualization",
      conversationShareOpenLink: "Open the shared conversation containing the visualization",
      conversationShareWarningTitle: "Whole-conversation share link",
      conversationShareWarningBody: "This link may include conversation content up to the time it was shared, not only the current visualization.",
      conversationShareFailedPrefix: "Conversation share save stopped at {stage}: {reason}",
      conversationShareChangedButSaveFailed: "The whole-conversation share link was created or updated, but the Obsidian note was not saved. The link may remain active. If needed, manage or disable it manually from ChatGPT; the extension will not roll it back automatically.",
      conversationShareCopiedButSaveFailed: "A whole-conversation public link was copied, but the Obsidian note was not saved. The link may remain active. If needed, manage or disable it manually from ChatGPT; the extension will not disable it automatically.",
      conversationShareChangeAttemptUnverified: "The whole-conversation share action ran, but its URL was not validated and the Obsidian note was not saved. The link may remain active. Check ChatGPT's share screen and manage it manually if needed; the extension will not roll it back automatically.",
      runtimeUnavailable: "extension runtime unavailable",
      runtimeDisconnectedRefresh: "The extension was reloaded or its connection to this ChatGPT tab was lost. Refresh this tab, then click Save to Obsidian again."
    },
    ko: {
      savingButton: "\uC800\uC7A5 \uC911…",
      saveButton: "Obsidian 저장",
      untitledQuestion: "제목 없는 질문",
      summaryTitle: "요약 제목",
      questionHeading: "질문",
      answerHeading: "답변",
      attachmentsHeading: "첨부파일",
      htmlLearningHeading: "HTML 학습자료",
      originalQuestionHeading: "원본 질문",
      originalAnswerHeading: "원본 답변",
      nativeSaveFailedPrefix: "Native helper 저장 실패: ",
      nativeSaveFailedSuffix: "\nMarkdown 노트를 URI mode로 열도록 시도했지만 Obsidian이 실제 파일을 생성했는지는 확인할 수 없습니다. HTML 첨부파일은 저장되지 않았을 수 있습니다.",
      nativeSaveNoFallbackSuffix: "\n생성된 Markdown이 URI로 안정적으로 저장하기에는 너무 커서 URI mode로 다시 보내지 않았습니다.",
      htmlDownloadNotAttachedWarning: "HTML 파일이 Chrome으로 다운로드되었지만, 확장 프로그램이 Obsidian 노트에 첨부하지 못했습니다.",
      htmlDownloadCopyFailedWarning: "HTML 파일이 Chrome으로 다운로드되었지만, Obsidian vault로 복사하지 못했습니다.",
      htmlArtifactCaptureFailedWarning: "HTML artifact 내용을 읽거나 다운로드하지 못해 Obsidian 노트에 첨부하지 못했습니다.",
      generatedArtifactWarningPrefix: "일부 생성 파일을 안전하게 읽지 못했습니다:\n",
      markdownOpenActionRequired: "ChatGPT가 상세 Markdown artifact를 여는 데 실제 클릭을 요구합니다. 이 창을 닫은 뒤 강조된 .md 파일명 카드를 한 번 눌러주세요. 확장 프로그램이 열린 파일을 읽고 자동으로 저장을 계속합니다.",
      markdownDownloadActionRequired: "ChatGPT가 상세 Markdown 파일 다운로드에 실제 클릭을 요구합니다. 이 창을 닫은 뒤 강조된 '파일 다운로드' 버튼을 한 번 눌러주세요. 확장 프로그램은 이번에 내려받은 .md 파일만 사용해 자동으로 저장을 계속합니다.",
      htmlDownloadActionRequired: "확장 프로그램이 HTML 원문을 직접 읽지 못했습니다. 이 창을 닫은 뒤 파일 카드 오른쪽의 작은 '파일 다운로드' 버튼을 한 번 눌러주세요. 'HTML 학습자료 다운로드' 미리보기 버튼이 아닙니다. 확장 프로그램은 최대 90초 동안 기다린 후 Obsidian에 저장합니다.",
      htmlAttachmentSavedLine: "HTML 파일은 첨부파일로 저장되었습니다.",
      partialArtifactSaveConfirm: "ChatGPT 답변에 파일 산출물 {missingCount}개가 표시되지만 실제 내용을 안전하게 읽지 못했습니다.\n\n예상 HTML: {expectedHtmlCount}개\n확보한 HTML: {capturedHtmlCount}개\n누락 또는 미지원: {missingNames}\n\n취소를 누르면 저장을 중지합니다(권장). 확인을 누르면 읽을 수 있는 노트 본문과 실제로 확보한 파일만 부분 저장합니다.",
      partialRichArtifactSaveConfirm: "이 응답에는 상호작용형 앱 블록 {expectedRichCount}개가 있지만, 완전한 것으로 검증해 저장할 수 있는 사본은 {completeRichCount}개입니다.\n\n누락 앱 블록: {missingRichCount}개\n누락 파일 산출물: {missingFileNames}\n\n취소를 누르면 Obsidian 노트와 첨부파일을 만들지 않습니다(권장). 확인을 누르면 앱 블록 바깥의 읽을 수 있는 설명문, 실제로 확보한 파일, 앱 블록 누락 경고만 부분 저장합니다.",
      missingRichArtifactWarningTitle: "상호작용형 앱 블록 미저장",
      missingRichArtifactWarningBody: "원본 응답에는 앱 블록 {expectedRichCount}개가 있었지만, 저장 가능한 원본 또는 검증된 완전 정적 사본을 확보하지 못했습니다. 아래에는 앱 블록 바깥의 설명문만 포함됩니다.",
      sourceFileDisplayName: "출처 파일 표시명: ",
      nativeAttachmentAuditFailed: "네이티브 도우미가 첨부파일을 완전하게 저장하지 못했습니다. 노트가 이미 생겼을 수 있지만 다음 요청 파일은 확인되지 않았습니다: ",
      visualizeShareConfirm: "이 시각화를 Obsidian에 저장하기 위해 ChatGPT 공유링크를 생성하거나 기존 링크를 재사용합니다.\n\n선택 권한인 클립보드 읽기 권한을 요청합니다. 이번 시도의 '링크 복사' 동작 뒤 새 '복사됨' 표시가 확인된 경우에만 클립보드를 한 번 읽어 ChatGPT 공유 URL 하나인지 검증합니다. 읽은 값은 로그나 별도 저장소에 기록하거나 다른 곳으로 전송하지 않으며, 검증된 링크만 이 Obsidian 노트에 저장합니다. 권한이 거부되거나 자동 읽기가 불가능하면 확장 프로그램의 빈 입력칸에 링크를 직접 붙여넣도록 안내합니다.\n\n공유 설정에 따라 링크를 아는 사람이 공유된 내용을 볼 수 있습니다. 시각화 자체는 Vault에 복사되지 않으며 인터넷 연결과 ChatGPT 공유 페이지에 의존합니다.\n\n취소: 권한을 요청하거나 공유 버튼을 누르지 않고 아무 노트도 만들지 않음\n확인: 권한을 요청하고 현재 시각화 답변의 공유 UI만 자동 조작한 뒤 검증된 Visualize 요청 문맥을 저장",
      visualizeConsentTitle: "공유 시각화 저장",
      visualizeConsentContinue: "계속",
      visualizeConsentCancel: "취소",
      visualizeShareHeading: "시각화",
      visualizeShareOpenLink: "ChatGPT에서 공유 시각화 열기",
      directVisualizeRequestHeading: "시각화 요청",
      directVisualizeExplanationHeading: "시각화 설명",
      richAppShareHeading: "상호작용형 앱",
      richAppShareOpenLink: "ChatGPT에서 공유 앱 열기",
      richAppRequestHeading: "요청",
      richAppExplanationHeading: "앱 설명",
      richAppShareConfirm: "이 상호작용형 앱을 Obsidian에 저장하기 위해 ChatGPT 공유링크를 생성하거나 기존 링크를 재사용합니다.\n\n선택 권한인 클립보드 읽기 권한을 요청합니다. 이번 시도의 '링크 복사' 동작 뒤 새 '복사됨' 표시가 확인된 경우에만 클립보드를 한 번 읽어 ChatGPT 공유 URL 하나인지 검증합니다. 읽은 값은 로그나 별도 저장소에 기록하거나 다른 곳으로 전송하지 않으며, 검증된 링크만 이 Obsidian 노트에 저장합니다. 권한이 거부되거나 자동 읽기가 불가능하면 확장 프로그램의 빈 입력칸에 링크를 직접 붙여넣도록 안내합니다.\n\n앱 자체는 Vault에 복사되지 않으며 인터넷 연결과 ChatGPT 공유 페이지에 의존합니다.\n\n취소: 권한을 요청하거나 공유 버튼을 누르지 않고 아무 노트도 만들지 않음\n확인: 권한을 요청하고 현재 앱 응답의 공유 UI만 자동 조작한 뒤 검증된 공급자 중립 앱 문맥을 저장",
      richAppConsentTitle: "공유 앱 저장",
      richAppShareFailedPrefix: "공유 앱 저장이 {stage} 단계에서 중단되었습니다: {reason}",
      richAppReferenceWarningTitle: "원격 앱 참조",
      richAppReferenceWarningBody: "이 상호작용형 앱은 Vault에 저장된 로컬 파일이 아닙니다. 인터넷 연결과 ChatGPT 공유 페이지에 의존하며, 공유가 해제되거나 접근 정책이 바뀌면 열리지 않을 수 있습니다.",
      visualizeShareReferenceWarningTitle: "원격 시각화 참조",
      visualizeShareReferenceWarningBody: "시각화는 Vault에 저장된 로컬 파일이 아닙니다. 인터넷 연결과 ChatGPT 공유 페이지에 의존하며, 공유가 해제되거나 접근 정책이 바뀌면 열리지 않을 수 있습니다. 공유 설정에 따라 링크를 아는 사람이 접근할 수 있습니다.",
      visualizeShareFailedPrefix: "Visualize 공유 저장이 {stage} 단계에서 중단되었습니다: {reason}",
      visualizeManualShareTitle: "ChatGPT 공유링크 붙여넣기",
      visualizeManualShareBody: "클립보드를 자동으로 읽을 수 없습니다. https://chatgpt.com/s/<share-token> 또는 https://chatgpt.com/share/<share-token> 링크 하나만 아래 빈 입력칸에 직접 붙여넣으세요.",
      visualizeManualSharePlaceholder: "https://chatgpt.com/s/<share-token>",
      visualizeManualShareSave: "이 링크 사용",
      visualizeManualShareCancel: "취소",
      visualizeManualShareInvalid: "올바른 ChatGPT 공유링크 하나만 입력하세요.",
      visualizeShareCreatedButSaveFailed: "ChatGPT 공유링크는 생성됐지만 Obsidian 노트는 저장되지 않았습니다. 공유링크는 계속 활성 상태일 수 있습니다. 필요하면 ChatGPT 공유 화면에서 직접 공유를 해제하세요. 확장 프로그램은 자동으로 공유를 해제하지 않습니다.",
      visualizeShareCreateAttemptUnverified: "ChatGPT 공유링크 생성 동작이 실행됐지만 공유 URL을 검증하지 못해 Obsidian 노트는 저장되지 않았습니다. 공유링크가 활성 상태일 수 있습니다. 필요하면 ChatGPT 공유 화면에서 확인한 뒤 직접 공유를 해제하세요. 확장 프로그램은 자동으로 공유를 해제하지 않습니다.",
      conversationShareConfirm: "현재 답변에는 개별 응답 공유 기능이 없습니다.\n\n계속하면 이 시각화 답변 하나가 아니라 공유 시점까지의 대화 내용이 함께 공유될 수 있습니다. 이 전체 대화 공유링크를 Obsidian 노트에 저장합니다.\n\n취소: 공유 버튼을 누르거나 노트를 만들지 않음\n확인: 대화를 공유하고 검증된 대화 공유링크만 저장",
      conversationShareConsentTitle: "전체 대화 공유링크 저장",
      conversationShareUpdateConfirm: "기존 전체 대화 공유링크에 현재 시각화가 포함되지 않았을 수 있습니다. 현재 내용을 포함하도록 공유링크를 업데이트하시겠습니까?",
      conversationShareHeading: "시각화",
      conversationShareOpenLink: "시각화가 포함된 공유 대화 열기",
      conversationShareWarningTitle: "전체 대화 공유 링크",
      conversationShareWarningBody: "이 링크에는 현재 시각화만이 아니라 공유 시점까지의 대화 내용이 포함될 수 있습니다.",
      conversationShareFailedPrefix: "전체 대화 공유 저장이 {stage} 단계에서 중단되었습니다: {reason}",
      conversationShareChangedButSaveFailed: "전체 대화 공유링크가 생성되거나 업데이트됐지만 Obsidian 노트는 저장되지 않았습니다. 링크는 계속 활성 상태일 수 있습니다. 필요하면 ChatGPT에서 직접 공유를 관리하거나 해제하세요. 확장 프로그램은 자동으로 되돌리지 않습니다.",
      conversationShareCopiedButSaveFailed: "전체 대화 공개링크가 클립보드에 복사됐지만 Obsidian 노트는 저장되지 않았습니다. 링크는 계속 활성 상태일 수 있습니다. 필요하면 ChatGPT에서 직접 공유 상태를 관리하거나 해제하세요. 확장 프로그램은 자동으로 해제하지 않습니다.",
      conversationShareChangeAttemptUnverified: "전체 대화 공유 동작이 실행됐지만 URL을 검증하지 못해 Obsidian 노트는 저장되지 않았습니다. 링크가 활성 상태일 수 있습니다. ChatGPT 공유 화면에서 확인하고 필요하면 직접 관리하세요. 확장 프로그램은 자동으로 되돌리지 않습니다.",
      runtimeUnavailable: "extension runtime을 사용할 수 없습니다",
      runtimeDisconnectedRefresh: "확장 프로그램이 다시 로드되어 이 ChatGPT 탭의 연결이 끊겼습니다. 탭을 새로고침한 뒤 Obsidian 저장을 다시 눌러주세요."
    }
  };

  let settings = { uiLanguage: DEFAULT_LANGUAGE, vaultName: "", folderPath: "ChatGPT", prefixDate: true, vaultPath: "", htmlSaveDir: "", saveHtmlCodeBlocks: false, usePreviousQaForHtml: false };
  const SYNC_KEYS = ["uiLanguage","vaultName","folderPath","prefixDate","includeTime","keepQM","bodyTitle","saveHtmlCodeBlocks","usePreviousQaForHtml"];
  const LEGACY_SYNC_KEYS = [...SYNC_KEYS, "htmlSaveDir"];
  const LOCAL_KEYS = ["vaultPath","htmlSaveDir","htmlSaveDirMigratedFromSync"];

  function debugLog(message, data = undefined) {
    if (!DEBUG) return;
    if (data === undefined) {
      console.debug("[GPT→Obsidian]", message);
    } else {
      console.debug("[GPT→Obsidian]", message, data);
    }
  }

  function artifactDebugLog(message, data = undefined) {
    if (!ARTIFACT_DEBUG) return;
    if (data === undefined) {
      console.debug("[GPT→Obsidian][artifact]", message);
    } else {
      console.debug("[GPT→Obsidian][artifact]", message, data);
    }
  }

  function logBuildDiagnostic() {
    console.info("[GPT->Obsidian] content diagnostic", {
      buildVersion: VERSION,
      saveHtmlCodeBlocksAsAttachments: !!settings.saveHtmlCodeBlocks,
      usePreviousQaForHtml: !!settings.usePreviousQaForHtml,
      contentScriptVersion: VERSION
    });
  }

  function normalizeLanguage(value) {
    return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
  }

  function t(key) {
    const language = normalizeLanguage(settings.uiLanguage);
    return I18N[language]?.[key] || I18N[DEFAULT_LANGUAGE][key] || key;
  }

  function updateInjectedButtonText() {
    document.querySelectorAll(".gpt2obs-btn").forEach((button) => {
      if (button.dataset.gpt2obsBusy !== "true") {
        button.textContent = t("saveButton");
      }
    });
  }

  function applySyncSettings(st) {
    settings.uiLanguage = normalizeLanguage(st.uiLanguage);
    settings.vaultName = st.vaultName || "";
    settings.folderPath = st.folderPath === undefined ? "ChatGPT" : String(st.folderPath || "");
    settings.prefixDate = (st.prefixDate === undefined) ? true : st.prefixDate;
    settings.includeTime = !!st.includeTime;
    settings.keepQM = !!st.keepQM;
    settings.bodyTitle = (st.bodyTitle === undefined) ? (navigator.userAgent.includes("Windows")) : !!st.bodyTitle;
    settings.saveHtmlCodeBlocks = !!st.saveHtmlCodeBlocks;
    settings.usePreviousQaForHtml = !!st.usePreviousQaForHtml;
  }

  function applyLocalSettings(st) {
    settings.vaultPath = st.vaultPath || "";
    settings.htmlSaveDir = st.htmlSaveDir || "";
  }

  function migrateHtmlSaveDir(syncState, localState, callback) {
    const legacyHtmlSaveDir = syncState.htmlSaveDir || "";
    if (!localState.htmlSaveDir && legacyHtmlSaveDir && !localState.htmlSaveDirMigratedFromSync) {
      chrome.storage.local.set({
        htmlSaveDir: legacyHtmlSaveDir,
        htmlSaveDirMigratedFromSync: true
      }, () => {
        localState.htmlSaveDir = legacyHtmlSaveDir;
        localState.htmlSaveDirMigratedFromSync = true;
        callback();
      });
      return;
    }
    callback();
  }

  chrome.storage.sync.get(LEGACY_SYNC_KEYS, (syncState) => {
    chrome.storage.local.get(LOCAL_KEYS, (localState) => {
      migrateHtmlSaveDir(syncState, localState, () => {
        applySyncSettings(syncState);
        applyLocalSettings(localState);
        logBuildDiagnostic();
        updateInjectedButtonText();
      });
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.uiLanguage) {
        settings.uiLanguage = normalizeLanguage(changes.uiLanguage.newValue);
        updateInjectedButtonText();
      }
      if (changes.vaultName) settings.vaultName = changes.vaultName.newValue;
      if (changes.folderPath) {
        settings.folderPath = changes.folderPath.newValue === undefined
          ? "ChatGPT"
          : String(changes.folderPath.newValue || "");
      }
      if (changes.prefixDate) settings.prefixDate = changes.prefixDate.newValue;
      if (changes.includeTime) settings.includeTime = changes.includeTime.newValue;
      if (changes.keepQM) settings.keepQM = changes.keepQM.newValue;
      if (changes.bodyTitle) settings.bodyTitle = changes.bodyTitle.newValue;
      if (changes.saveHtmlCodeBlocks) {
        settings.saveHtmlCodeBlocks = !!changes.saveHtmlCodeBlocks.newValue;
        logBuildDiagnostic();
      }
      if (changes.usePreviousQaForHtml) {
        settings.usePreviousQaForHtml = !!changes.usePreviousQaForHtml.newValue;
        logBuildDiagnostic();
      }
    }
    if (area === "local") {
      if (changes.vaultPath) settings.vaultPath = changes.vaultPath.newValue || "";
      if (changes.htmlSaveDir) settings.htmlSaveDir = changes.htmlSaveDir.newValue || "";
    }
  });

  function nowIso() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDate(d=new Date()) {
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g,' ').trim();
  }

  function makeTitle(text) {
    if (!text) return t("untitledQuestion");
    let titleText = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/\!\[[^\]]*\]\([^\)]*\)/g, " ")
      .replace(/\[[^\]]*\]\([^\)]*\)/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const m = titleText.match(/^(.*?)([?.!！？。]|$)/);
    titleText = (m && m[1]) ? m[1] : titleText;
    const MAX = 40;
    if (titleText.length > MAX) titleText = titleText.slice(0, MAX).trim() + "…";
    titleText = titleText.trim(); // keep trailing punctuation like '?'
    return titleText || t("summaryTitle");
  }

  function yamlQuote(value) {
    return JSON.stringify(String(value || ""));
  }

  function captureMetadataFrontmatterLines(captureMetadata = null) {
    if (!captureMetadata || captureMetadata.captureStatus !== "partial") return [];
    const expected = Math.max(0, Number(captureMetadata.richArtifactsExpected) || 0);
    const complete = Math.max(0, Number(captureMetadata.richArtifactsComplete) || 0);
    return [
      "capture_status: partial",
      `rich_artifacts_expected: ${expected}`,
      `rich_artifacts_complete: ${complete}`,
      "interactive_behavior_preserved: false"
    ];
  }

  function buildMarkdown({title, questionText, answerText, url, attachmentMarker = "", captureMetadata = null}) {
    const created = nowIso();
    return [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(url)}`,
      `created: ${yamlQuote(created)}`,
      "tags: [chatgpt, capture]",
      ...captureMetadataFrontmatterLines(captureMetadata),
      "---",
      "",
      (settings && settings.bodyTitle ? `# ${title}` : ''),
      "",
      `# ${t("questionHeading")}`,
      "",
      questionText || "",
      "",
      `# ${t("answerHeading")}`,
      "",
      answerText || "",
      attachmentMarker
    ].join("\n");
  }

  function buildHtmlLearningMarkdown({title, questionText, answerText, url, attachmentMarker = "", useOriginalHeadings = true, captureMetadata = null}) {
    const created = nowIso();
    const questionHeading = useOriginalHeadings ? t("originalQuestionHeading") : t("questionHeading");
    const answerHeading = useOriginalHeadings ? t("originalAnswerHeading") : t("answerHeading");
    const lines = [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(url)}`,
      `created: ${yamlQuote(created)}`,
      "tags: [chatgpt, capture]",
      ...captureMetadataFrontmatterLines(captureMetadata),
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) {
      lines.push(`# ${title}`, "");
    }
    lines.push(
      `# ${t("htmlLearningHeading")}`,
      "",
      attachmentMarker || "",
      "",
      `# ${questionHeading}`,
      "",
      questionText || "",
      "",
      `# ${answerHeading}`,
      "",
      answerText || ""
    );
    return lines.join("\n");
  }

  function visualizeShareMetadata({sourceUrl = "", shareUrl = "", captureMode = "previous-qa-visualize-share-link", richArtifactsExpected = 1, richArtifactsRemoteReferenced = richArtifactsExpected} = {}) {
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    const remoteReferenced = Math.max(0, Math.min(expected, Number(richArtifactsRemoteReferenced) || 0));
    return {
      source: String(sourceUrl || ""),
      visualizeShareUrl: normalizeChatGptShareUrl(shareUrl),
      appProvider: "visualize",
      appProvenance: "verified",
      captureStatus: "remote-reference",
      captureMode: String(captureMode || "previous-qa-visualize-share-link"),
      richArtifactsExpected: expected,
      richArtifactsLocalComplete: 0,
      richArtifactsRemoteReferenced: remoteReferenced,
      interactiveBehaviorPreserved: "remote-only",
      offlineAvailable: false
    };
  }

  function buildVisualizeShareReferenceWarning() {
    return `> [!warning] ${t("visualizeShareReferenceWarningTitle")}\n> ${t("visualizeShareReferenceWarningBody")}`;
  }

  function buildVisualizeShareMarkdownDraft({
    title,
    sourceUrl,
    questionText,
    answerText,
    richArtifactsExpected = 1,
    captureMode = "previous-qa-visualize-share-link"
  } = {}) {
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const answer = String(answerText || "").trim();
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    if (!titleText || !sourceText || !question || !answer) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      'visualize_share_url: "{{validatedChatGptShareUrl}}"',
      "app_provider: visualize",
      "app_provenance: verified",
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, visualize, capture]",
      "capture_status: remote-reference",
      `capture_mode: ${String(captureMode || "previous-qa-visualize-share-link")}`,
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${expected}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      "",
      ...(settings && settings.bodyTitle ? [`# ${titleText}`, ""] : []),
      `# ${t("visualizeShareHeading")}`,
      "",
      `[${t("visualizeShareOpenLink")}]({{validatedChatGptShareUrl}})`,
      "",
      buildVisualizeShareReferenceWarning(),
      "",
      `# ${t("originalQuestionHeading")}`,
      "",
      question,
      "",
      `# ${t("originalAnswerHeading")}`,
      "",
      answer
    ];
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildVisualizeShareMarkdown({
    title,
    sourceUrl,
    shareUrl,
    questionText,
    answerText,
    attachmentMarker = "",
    richArtifactsExpected = 1,
    richArtifactsRemoteReferenced = richArtifactsExpected,
    captureMode = "previous-qa-visualize-share-link"
  } = {}) {
    const normalizedShareUrl = normalizeChatGptShareUrl(shareUrl);
    if (!normalizedShareUrl) return "";
    const metadata = visualizeShareMetadata({
      sourceUrl,
      shareUrl: normalizedShareUrl,
      captureMode,
      richArtifactsExpected,
      richArtifactsRemoteReferenced
    });
    const created = nowIso();
    const lines = [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(metadata.source)}`,
      `visualize_share_url: ${yamlQuote(metadata.visualizeShareUrl)}`,
      `app_provider: ${metadata.appProvider}`,
      `app_provenance: ${metadata.appProvenance}`,
      `created: ${yamlQuote(created)}`,
      "tags: [chatgpt, visualize, capture]",
      `capture_status: ${metadata.captureStatus}`,
      `capture_mode: ${metadata.captureMode}`,
      `rich_artifacts_expected: ${metadata.richArtifactsExpected}`,
      `rich_artifacts_local_complete: ${metadata.richArtifactsLocalComplete}`,
      `rich_artifacts_remote_referenced: ${metadata.richArtifactsRemoteReferenced}`,
      `interactive_behavior_preserved: ${metadata.interactiveBehaviorPreserved}`,
      `offline_available: ${metadata.offlineAvailable}`,
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${title}`, "");
    lines.push(
      `# ${t("visualizeShareHeading")}`,
      "",
      `[${t("visualizeShareOpenLink")}](${metadata.visualizeShareUrl})`,
      "",
      buildVisualizeShareReferenceWarning(),
      "",
      `# ${t("originalQuestionHeading")}`,
      "",
      questionText || "",
      "",
      `# ${t("originalAnswerHeading")}`,
      "",
      answerText || "",
      attachmentMarker || ""
    );
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function conversationShareMetadata({
    sourceUrl = "",
    shareUrl = "",
    captureMode = "previous-qa-conversation-share-link",
    targetTurnId = "",
    shareInteraction = "",
    conversationShareFreshness = "",
    richArtifactsExpected = 1,
    richArtifactsRemoteReferenced = richArtifactsExpected
  } = {}) {
    const normalizedShareUrl = validateStrictChatGptShareUrl(shareUrl);
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    const remoteReferenced = Math.max(0, Math.min(expected, Number(richArtifactsRemoteReferenced) || 0));
    const source = String(sourceUrl || "").trim();
    const target = String(targetTurnId || "").trim();
    const interaction = /^(?:dialog|instant-copy)$/.test(String(shareInteraction || "").trim())
      ? String(shareInteraction).trim()
      : "";
    const freshness = /^(?:verified|unverified)$/.test(String(conversationShareFreshness || "").trim())
      ? String(conversationShareFreshness).trim()
      : "";
    if (!normalizedShareUrl || !source || !target) return null;
    return {
      source,
      conversationShareUrl: normalizedShareUrl,
      captureStatus: "remote-reference",
      captureMode: String(captureMode || "previous-qa-conversation-share-link"),
      shareScope: "conversation",
      targetTurnId: target,
      ...(interaction
        ? { shareInteraction: interaction }
        : {}),
      ...(freshness
        ? { conversationShareFreshness: freshness }
        : {}),
      richArtifactsExpected: expected,
      richArtifactsLocalComplete: 0,
      richArtifactsRemoteReferenced: remoteReferenced,
      interactiveBehaviorPreserved: "remote-only",
      offlineAvailable: false
    };
  }

  function buildConversationShareWarning() {
    return `> [!warning] ${t("conversationShareWarningTitle")}\n> ${t("conversationShareWarningBody")}`;
  }

  function conversationShareCaptureMode(bodyMode) {
    if (bodyMode === "direct-visualize") return "direct-visualize-conversation-share-link";
    if (bodyMode === "previous-qa-rich-app") return "previous-qa-rich-app-conversation-share-link";
    if (bodyMode === "rich-app-continuation") return "rich-app-continuation-conversation-share-link";
    return "previous-qa-conversation-share-link";
  }

  function conversationShareAppProvenance(bodyMode) {
    if (bodyMode === "previous-qa-rich-app" || bodyMode === "rich-app-continuation") {
      return { provider: "unknown", provenance: "unverified" };
    }
    return { provider: "visualize", provenance: "verified" };
  }

  function buildConversationShareMarkdownDraft({
    title,
    sourceUrl,
    bodyMode = "previous-qa",
    questionText,
    answerText = "",
    explanationText = "",
    targetTurnId = "",
    richArtifactsExpected = 1
  } = {}) {
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const answer = String(answerText || "").trim();
    const explanation = String(explanationText || "").trim();
    const target = String(targetTurnId || "").trim();
    const mode = conversationShareCaptureMode(bodyMode);
    const appProvenance = conversationShareAppProvenance(bodyMode);
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    if (!titleText || !sourceText || !question || !target) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      'conversation_share_url: "{{validatedChatGptShareUrl}}"',
      `app_provider: ${appProvenance.provider}`,
      `app_provenance: ${appProvenance.provenance}`,
      "capture_status: remote-reference",
      `capture_mode: ${mode}`,
      "share_scope: conversation",
      `target_turn_id: ${yamlQuote(target)}`,
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, capture, conversation-share]",
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${expected}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      "",
      ...(settings && settings.bodyTitle ? [`# ${titleText}`, ""] : []),
      `# ${t("conversationShareHeading")}`,
      "",
      `[${t("conversationShareOpenLink")}]({{validatedChatGptShareUrl}})`,
      "",
      buildConversationShareWarning()
    ];
    if (bodyMode === "direct-visualize") {
      lines.push("", `# ${t("directVisualizeRequestHeading")}`, "", question);
      if (explanation) lines.push("", `# ${t("directVisualizeExplanationHeading")}`, "", explanation);
    } else if (bodyMode === "rich-app-continuation") {
      lines.push("", `# ${t("richAppRequestHeading")}`, "", question);
      if (explanation) lines.push("", `# ${t("richAppExplanationHeading")}`, "", explanation);
    } else {
      if (!answer) return "";
      lines.push("", `# ${t("originalQuestionHeading")}`, "", question, "", `# ${t("originalAnswerHeading")}`, "", answer);
    }
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildConversationShareMarkdown({
    title,
    sourceUrl,
    shareUrl,
    bodyMode = "previous-qa",
    questionText,
    answerText = "",
    explanationText = "",
    targetTurnId = "",
    attachmentMarker = "",
    shareInteraction = "",
    conversationShareFreshness = "",
    richArtifactsExpected = 1,
    richArtifactsRemoteReferenced = richArtifactsExpected
  } = {}) {
    const metadata = conversationShareMetadata({
      sourceUrl,
      shareUrl,
      captureMode: conversationShareCaptureMode(bodyMode),
      targetTurnId,
      shareInteraction,
      conversationShareFreshness,
      richArtifactsExpected,
      richArtifactsRemoteReferenced
    });
    const question = String(questionText || "").trim();
    const answer = String(answerText || "").trim();
    const explanation = String(explanationText || "").trim();
    const appProvenance = conversationShareAppProvenance(bodyMode);
    if (!metadata || !String(title || "").trim() || !question) return "";
    if ((bodyMode === "previous-qa" || bodyMode === "previous-qa-rich-app") && !answer) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(metadata.source)}`,
      `conversation_share_url: ${yamlQuote(metadata.conversationShareUrl)}`,
      `app_provider: ${appProvenance.provider}`,
      `app_provenance: ${appProvenance.provenance}`,
      `capture_status: ${metadata.captureStatus}`,
      `capture_mode: ${metadata.captureMode}`,
      `share_scope: ${metadata.shareScope}`,
      `target_turn_id: ${yamlQuote(metadata.targetTurnId)}`,
      ...(metadata.shareInteraction ? [`share_interaction: ${metadata.shareInteraction}`] : []),
      ...(metadata.conversationShareFreshness ? [`conversation_share_freshness: ${metadata.conversationShareFreshness}`] : []),
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, capture, conversation-share]",
      `rich_artifacts_expected: ${metadata.richArtifactsExpected}`,
      `rich_artifacts_local_complete: ${metadata.richArtifactsLocalComplete}`,
      `rich_artifacts_remote_referenced: ${metadata.richArtifactsRemoteReferenced}`,
      `interactive_behavior_preserved: ${metadata.interactiveBehaviorPreserved}`,
      `offline_available: ${metadata.offlineAvailable}`,
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${title}`, "");
    lines.push(
      `# ${t("conversationShareHeading")}`,
      "",
      `[${t("conversationShareOpenLink")}](${metadata.conversationShareUrl})`,
      "",
      buildConversationShareWarning()
    );
    if (bodyMode === "direct-visualize") {
      lines.push("", `# ${t("directVisualizeRequestHeading")}`, "", question);
      if (explanation) lines.push("", `# ${t("directVisualizeExplanationHeading")}`, "", explanation);
    } else if (bodyMode === "rich-app-continuation") {
      lines.push("", `# ${t("richAppRequestHeading")}`, "", question);
      if (explanation) lines.push("", `# ${t("richAppExplanationHeading")}`, "", explanation);
    } else {
      lines.push("", `# ${t("originalQuestionHeading")}`, "", question, "", `# ${t("originalAnswerHeading")}`, "", answer);
    }
    if (attachmentMarker) lines.push("", attachmentMarker);
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildDirectVisualizeShareMarkdown({
    title,
    sourceUrl,
    shareUrl,
    questionText,
    explanationText = "",
    attachmentMarker = "",
    richArtifactsExpected = 1,
    richArtifactsRemoteReferenced = richArtifactsExpected
  } = {}) {
    const normalizedShareUrl = normalizeChatGptShareUrl(shareUrl);
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const explanation = String(explanationText || "").trim();
    if (!normalizedShareUrl || !titleText || !sourceText || !question) return "";
    const metadata = visualizeShareMetadata({
      sourceUrl: sourceText,
      shareUrl: normalizedShareUrl,
      captureMode: "direct-visualize-share-link",
      richArtifactsExpected,
      richArtifactsRemoteReferenced
    });
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(metadata.source)}`,
      `visualize_share_url: ${yamlQuote(metadata.visualizeShareUrl)}`,
      `app_provider: ${metadata.appProvider}`,
      `app_provenance: ${metadata.appProvenance}`,
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, visualize, capture]",
      `capture_status: ${metadata.captureStatus}`,
      `capture_mode: ${metadata.captureMode}`,
      `rich_artifacts_expected: ${metadata.richArtifactsExpected}`,
      `rich_artifacts_local_complete: ${metadata.richArtifactsLocalComplete}`,
      `rich_artifacts_remote_referenced: ${metadata.richArtifactsRemoteReferenced}`,
      `interactive_behavior_preserved: ${metadata.interactiveBehaviorPreserved}`,
      `offline_available: ${metadata.offlineAvailable}`,
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${titleText}`, "");
    lines.push(
      `# ${t("visualizeShareHeading")}`,
      "",
      `[${t("visualizeShareOpenLink")}](${metadata.visualizeShareUrl})`,
      "",
      buildVisualizeShareReferenceWarning(),
      "",
      `# ${t("directVisualizeRequestHeading")}`,
      "",
      question
    );
    if (explanation) {
      lines.push("", `# ${t("directVisualizeExplanationHeading")}`, "", explanation);
    }
    if (attachmentMarker) lines.push("", attachmentMarker);
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildDirectVisualizeShareMarkdownDraft({
    title,
    sourceUrl,
    questionText,
    explanationText = "",
    richArtifactsExpected = 1
  } = {}) {
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    if (!titleText || !sourceText || !question) return "";
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    const explanation = String(explanationText || "").trim();
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      'visualize_share_url: "{{validatedChatGptShareUrl}}"',
      "app_provider: visualize",
      "app_provenance: verified",
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, visualize, capture]",
      "capture_status: remote-reference",
      "capture_mode: direct-visualize-share-link",
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${expected}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${titleText}`, "");
    lines.push(
      `# ${t("visualizeShareHeading")}`,
      "",
      `[${t("visualizeShareOpenLink")}]({{validatedChatGptShareUrl}})`,
      "",
      buildVisualizeShareReferenceWarning(),
      "",
      `# ${t("directVisualizeRequestHeading")}`,
      "",
      question
    );
    if (explanation) lines.push("", `# ${t("directVisualizeExplanationHeading")}`, "", explanation);
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildRichAppContinuationShareMarkdownDraft({
    title,
    sourceUrl,
    questionText,
    explanationText = "",
    richArtifactsExpected = 1
  } = {}) {
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const explanation = String(explanationText || "").trim();
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    if (!titleText || !sourceText || !question) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      'rich_app_share_url: "{{validatedChatGptShareUrl}}"',
      "app_provider: unknown",
      "app_provenance: unverified",
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, app, capture]",
      "capture_status: remote-reference",
      "capture_mode: rich-app-continuation-share-link",
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${expected}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${titleText}`, "");
    lines.push(
      `# ${t("richAppShareHeading")}`,
      "",
      `[${t("richAppShareOpenLink")}]({{validatedChatGptShareUrl}})`,
      "",
      buildRichAppShareReferenceWarning(),
      "",
      `# ${t("richAppRequestHeading")}`,
      "",
      question
    );
    if (explanation) lines.push("", `# ${t("richAppExplanationHeading")}`, "", explanation);
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildRichAppShareReferenceWarning() {
    return `> [!warning] ${t("richAppReferenceWarningTitle")}\n> ${t("richAppReferenceWarningBody")}`;
  }

  function buildPreviousQaRichAppShareMarkdownDraft({
    title,
    sourceUrl,
    questionText,
    answerText,
    richArtifactsExpected = 1
  } = {}) {
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const answer = String(answerText || "").trim();
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    if (!titleText || !sourceText || !question || !answer) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      'rich_app_share_url: "{{validatedChatGptShareUrl}}"',
      "app_provider: unknown",
      "app_provenance: unverified",
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, app, capture]",
      "capture_status: remote-reference",
      "capture_mode: previous-qa-rich-app-share-link",
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${expected}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${titleText}`, "");
    lines.push(
      `# ${t("richAppShareHeading")}`,
      "",
      `[${t("richAppShareOpenLink")}]({{validatedChatGptShareUrl}})`,
      "",
      buildRichAppShareReferenceWarning(),
      "",
      `# ${t("originalQuestionHeading")}`,
      "",
      question,
      "",
      `# ${t("originalAnswerHeading")}`,
      "",
      answer
    );
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildPreviousQaRichAppShareMarkdown({
    title,
    sourceUrl,
    shareUrl,
    questionText,
    answerText,
    attachmentMarker = "",
    richArtifactsExpected = 1,
    richArtifactsRemoteReferenced = richArtifactsExpected
  } = {}) {
    const normalizedShareUrl = validateStrictChatGptShareUrl(shareUrl);
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const answer = String(answerText || "").trim();
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    const remoteReferenced = Math.max(0, Math.min(expected, Number(richArtifactsRemoteReferenced) || 0));
    if (!normalizedShareUrl || !titleText || !sourceText || !question || !answer) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      `rich_app_share_url: ${yamlQuote(normalizedShareUrl)}`,
      "app_provider: unknown",
      "app_provenance: unverified",
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, app, capture]",
      "capture_status: remote-reference",
      "capture_mode: previous-qa-rich-app-share-link",
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${remoteReferenced}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${titleText}`, "");
    lines.push(
      `# ${t("richAppShareHeading")}`,
      "",
      `[${t("richAppShareOpenLink")}](${normalizedShareUrl})`,
      "",
      buildRichAppShareReferenceWarning(),
      "",
      `# ${t("originalQuestionHeading")}`,
      "",
      question,
      "",
      `# ${t("originalAnswerHeading")}`,
      "",
      answer
    );
    if (attachmentMarker) lines.push("", attachmentMarker);
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  function buildRichAppContinuationShareMarkdown({
    title,
    sourceUrl,
    shareUrl,
    questionText,
    explanationText = "",
    attachmentMarker = "",
    richArtifactsExpected = 1,
    richArtifactsRemoteReferenced = richArtifactsExpected
  } = {}) {
    const normalizedShareUrl = validateStrictChatGptShareUrl(shareUrl);
    const titleText = String(title || "").trim();
    const sourceText = String(sourceUrl || "").trim();
    const question = String(questionText || "").trim();
    const explanation = String(explanationText || "").trim();
    const expected = Math.max(0, Number(richArtifactsExpected) || 0);
    const remoteReferenced = Math.max(0, Math.min(expected, Number(richArtifactsRemoteReferenced) || 0));
    if (!normalizedShareUrl || !titleText || !sourceText || !question) return "";
    const lines = [
      "---",
      `title: ${yamlQuote(titleText)}`,
      `source: ${yamlQuote(sourceText)}`,
      `rich_app_share_url: ${yamlQuote(normalizedShareUrl)}`,
      "app_provider: unknown",
      "app_provenance: unverified",
      `created: ${yamlQuote(nowIso())}`,
      "tags: [chatgpt, app, capture]",
      "capture_status: remote-reference",
      "capture_mode: rich-app-continuation-share-link",
      `rich_artifacts_expected: ${expected}`,
      "rich_artifacts_local_complete: 0",
      `rich_artifacts_remote_referenced: ${remoteReferenced}`,
      "interactive_behavior_preserved: remote-only",
      "offline_available: false",
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) lines.push(`# ${titleText}`, "");
    lines.push(
      `# ${t("richAppShareHeading")}`,
      "",
      `[${t("richAppShareOpenLink")}](${normalizedShareUrl})`,
      "",
      buildRichAppShareReferenceWarning(),
      "",
      `# ${t("richAppRequestHeading")}`,
      "",
      question
    );
    if (explanation) lines.push("", `# ${t("richAppExplanationHeading")}`, "", explanation);
    if (attachmentMarker) lines.push(attachmentMarker);
    return removeEmptyMarkdownLinkTargets(lines.join("\n"));
  }

  async function prepareVisualizeSharePreflight({
    currentAssistantNode,
    previousQa,
    visualizeContext = null,
    sourceUrl = location.href,
    btn = null,
    runtimeGuard = null,
    artifactContainer = null,
    fileLinks = null,
    artifactRows = null,
    readableFiles = undefined,
    nativePreflightFn = pingNativeHelper,
    nativePreflightOptions = {}
  } = {}) {
    if (!currentAssistantNode) return { ok: false, stage: "preflight", reason: "current assistant node was not found" };
    const mode = visualizeContext?.mode || "previous-qa";
    const isRichAppContinuation = mode === "rich-app-continuation";
    const isPreviousQaRichApp = mode === "previous-qa-rich-app";
    const isProviderNeutralRichApp = isRichAppContinuation || isPreviousQaRichApp;
    const resolvedPreviousQa = mode === "previous-qa" || isPreviousQaRichApp
      ? (previousQa || visualizeContext)
      : null;
    const requestNode = mode === "direct-visualize"
      ? visualizeContext?.visualizeRequestNode
      : isRichAppContinuation
        ? visualizeContext?.requestNode
        : isPreviousQaRichApp
          ? visualizeContext?.requestNode
          : resolvedPreviousQa?.requestNode || resolvedPreviousQa?.visualizeRequestNode;
    const questionText = mode === "direct-visualize" || isRichAppContinuation
      ? visualizeContext?.questionText
      : resolvedPreviousQa?.questionText;
    const answerText = mode === "direct-visualize" || isRichAppContinuation
      ? ""
      : resolvedPreviousQa?.answerText;
    if (mode === "direct-visualize") {
      if (!visualizeContext?.visualizeAnswerNode || visualizeContext.visualizeAnswerNode !== currentAssistantNode ||
          !visualizeContext?.visualizeRequestNode || !questionText ||
          !isExplicitVisualizeRequestNode(visualizeContext.visualizeRequestNode)) {
        return { ok: false, stage: "preflight", reason: "direct Visualize context could not be resolved" };
      }
    } else if (isPreviousQaRichApp) {
      const freshContext = revalidatePreviousQaRichAppContext(currentAssistantNode, visualizeContext);
      if (!freshContext.ok || !questionText || !answerText || !resolvedPreviousQa?.requestNode || !resolvedPreviousQa?.answerNode) {
        return { ok: false, stage: "preflight", reason: freshContext.reason || "provider-neutral previous-Q&A rich app context could not be resolved" };
      }
    } else if (isRichAppContinuation) {
      if (!visualizeContext?.currentAppAnswerNode || visualizeContext.currentAppAnswerNode !== currentAssistantNode ||
          !visualizeContext?.previousAppAnswerNode ||
          !visualizeContext?.requestNode || !questionText || visualizeContext.provider !== "unknown" ||
          !collectRichAppBlockCandidates(visualizeContext.previousAppAnswerNode).length) {
        return { ok: false, stage: "preflight", reason: "rich app continuation context could not be resolved" };
      }
    } else if (!questionText || !answerText || !resolvedPreviousQa?.requestNode || !resolvedPreviousQa?.answerNode) {
      return { ok: false, stage: "preflight", reason: "Q1/A1/Q2 could not be resolved" };
    }
    if (!isProviderNeutralRichApp && !isVisualizeShareCandidate(currentAssistantNode, { requestNode })) {
      return { ok: false, stage: "preflight", reason: "the response is not a structurally identified Visualize app block" };
    }
    if (runtimeGuard?.check) {
      const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "visualize-preflight");
      if (!runtimeStatus?.ok) return { ok: false, stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" };
    }
    const nativeStatus = await nativePreflightFn("visualize-preflight", {
      ...nativePreflightOptions,
      runtimeGuard
    });
    if (!nativeStatus?.ok) {
      return { ok: false, stage: "native-preflight", reason: nativeStatus?.error || "Native helper unavailable" };
    }

    const container = artifactContainer || (btn ? closestArtifactContainer(btn) : currentAssistantNode) || currentAssistantNode;
    const resolvedFileLinks = Array.isArray(fileLinks)
      ? fileLinks
      : collectFileLikeLinks(container);
    const resolvedArtifactRows = Array.isArray(artifactRows)
      ? artifactRows
      : collectArtifactFileRows(container, FILE_DELIVERABLE_EXTENSIONS);
    let resolvedReadableFiles = Array.isArray(readableFiles) ? readableFiles : [];
    if (readableFiles === undefined) {
      const expectedNames = Array.from(new Set([
        ...resolvedFileLinks.map(item => item?.name || ""),
        ...resolvedArtifactRows.map(item => item?.name || "")
      ].filter(name => /\.html?$/i.test(name))));
      resolvedReadableFiles = await readHtmlPreviews(container, expectedNames, []);
    }
    const fileIntegrity = assessArtifactIntegrity({
      fileLinks: resolvedFileLinks,
      artifactRows: resolvedArtifactRows,
      attachments: resolvedReadableFiles,
      downloadedAttachments: [],
      generatedMarkdown: {},
      failures: []
    });
    const localRichExpected = mode === "previous-qa" || isPreviousQaRichApp
      ? collectRichAppBlockCandidates(resolvedPreviousQa.answerNode, { idPrefix: "a1-rich" })
      : [];
    const localRichIntegrity = assessRichArtifactIntegrity({ expected: localRichExpected, captures: [] });
    const remoteRichExpected = collectRichAppBlockCandidates(currentAssistantNode, { idPrefix: "a2-rich" });
    const remoteRichIntegrity = assessRichArtifactIntegrity({ expected: remoteRichExpected, captures: [] });
    const richArtifactsExpected = remoteRichExpected.length;
    const explanationText = mode === "direct-visualize" || isRichAppContinuation
      ? extractDirectVisualizeExplanation(currentAssistantNode)
      : "";
    const title = makeTitle(questionText || answerText);
    const filePath = buildFilePath(title);
    const currentTurn = currentAssistantNode.closest?.("[data-testid^='conversation-turn-']") || null;
    const targetTurnId = String(currentTurn?.getAttribute?.("data-turn-id") || "").trim();
    const markdown = mode === "direct-visualize"
      ? buildDirectVisualizeShareMarkdownDraft({ title, sourceUrl, questionText, explanationText, richArtifactsExpected })
      : isPreviousQaRichApp
        ? buildPreviousQaRichAppShareMarkdownDraft({ title, sourceUrl, questionText, answerText, richArtifactsExpected })
        : isRichAppContinuation
          ? buildRichAppContinuationShareMarkdownDraft({ title, sourceUrl, questionText, explanationText, richArtifactsExpected })
          : buildVisualizeShareMarkdownDraft({ title, sourceUrl, questionText, answerText, richArtifactsExpected });
    if (!title || !filePath || !markdown) {
      return { ok: false, stage: "preflight", reason: "title, note path, or Markdown could not be assembled" };
    }
    return {
      ok: true,
      artifactContainer: container,
      fileLinks: resolvedFileLinks,
      artifactRows: resolvedArtifactRows,
      readableFiles: resolvedReadableFiles,
      fileIntegrity,
      localRichExpected,
      localRichIntegrity,
      remoteRichExpected,
      remoteRichIntegrity,
      richArtifactsExpected,
      mode,
      questionText,
      answerText,
      explanationText,
      targetTurnId,
      title,
      filePath,
      markdown
    };
  }

  function buildFilePath(title) {
    const date = formatDate();
    const time = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    const hhmmss = `${pad(time.getHours())}-${pad(time.getMinutes())}-${pad(time.getSeconds())}`;
    const datePrefix = settings.prefixDate ? (settings.includeTime ? `${date} ${hhmmss} - ` : `${date} - `) : "";
    const folder = String(settings.folderPath || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const fileBase = sanitizeFileName(`${datePrefix}${title}`);
    return (folder ? `${folder}/` : "") + fileBase + ".md";
  }

  function buildObsidianURI(args) {
    const vault = args.vault || "";
    const file = args.file;
    const content = args.content;
    const parts = [];
    if (vault) parts.push("vault=" + encodeURIComponent(vault));
    parts.push("file=" + encodeURIComponent(file));
    parts.push("content=" + encodeURIComponent(content));
    return "obsidian://new?" + parts.join("&");
  }

  function isCurrentGeneration() {
    return globalThis[STATE_KEY]?.generation === generation;
  }

  function isDuplicateContentSave(key, ttlMs = 30000) {
    const now = Date.now();
    const recent = state.recentSaves;
    for (const [savedKey, time] of recent.entries()) {
      if (now - time > ttlMs) recent.delete(savedKey);
    }
    const last = recent.get(key);
    if (last && now - last < ttlMs) return true;
    recent.set(key, now);
    return false;
  }

  function clearContentSaveReservation(key) {
    state.recentSaves.delete(key);
  }

  function openObsidianURIDirectly(uri) {
    try {
      const a = document.createElement("a");
      a.href = uri;
      a.rel = "noreferrer";
      a.style.display = "none";
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch (error) {
      console.warn("Failed to open Obsidian URI directly.", error);
    }

    window.location.href = uri;
  }

  function openObsidianURI(uri) {
    if (globalThis.chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: "open-obsidian-uri", uri }, (response) => {
          const err = globalThis.chrome?.runtime?.lastError;
          if (err || !response?.ok) {
            const message = err?.message || response?.error || "unknown";
            console.warn("Failed to open Obsidian through extension runtime; falling back to direct URI.", message);
            openObsidianURIDirectly(uri);
          }
        });
        return;
      } catch (error) {
        console.warn("Failed to message extension runtime; falling back to direct Obsidian URI.", error);
      }
    }

    openObsidianURIDirectly(uri);
  }

  async function saveObsidianNote({vaultName, vaultPath, filePath, content, attachments, downloadedAttachments, downloadedMarkdown, attachmentNames, allowPartialAttachments = false, htmlSaveDir, fallbackUri}, options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const sender = options.sendMessage || sendExtensionMessage;
    const openUri = options.openUri || openObsidianURIDirectly;
    const showAlert = options.showAlert || alert;

    const notifyRuntimeFailure = (result, phase = "native-save") => {
      if (runtimeGuard?.fail) {
        runtimeGuard.fail(result, phase);
        runtimeGuard.notify?.();
      } else {
        showAlert(t("runtimeDisconnectedRefresh"));
      }
    };

    const fallbackToUri = (message) => {
      let fallbackAttempted = false;
      if (fallbackUri) {
        fallbackAttempted = true;
        try { openUri(fallbackUri); } catch (error) { console.warn("Failed to attempt direct Obsidian URI fallback.", error); }
      }
      const hasDownloadedAttachment = Array.isArray(downloadedAttachments) && downloadedAttachments.length > 0;
      const prefix = hasDownloadedAttachment
        ? `${t("htmlDownloadCopyFailedWarning")}\n${t("nativeSaveFailedPrefix")}`
        : t("nativeSaveFailedPrefix");
      showAlert(prefix + message + (fallbackAttempted ? t("nativeSaveFailedSuffix") : t("nativeSaveNoFallbackSuffix")));
      return { ok: false, error: message, fallbackAttempted };
    };

    const runtimeStatus = runtimeGuard
      ? await checkRuntimeGuard(runtimeGuard, "native-save")
      : await pingExtensionRuntime("native-save", { sendMessage: sender });
    if (!runtimeStatus?.ok) {
      notifyRuntimeFailure(runtimeStatus, "native-save");
      return runtimeStatus;
    }
    const contextStatus = validateShareContextBoundary(
      { validateShareContext: options.validateContext },
      "native-save",
      "preflight"
    );
    if (!contextStatus.ok) {
      return {
        ok: false,
        stage: contextStatus.stage,
        error: contextStatus.reason,
        reason: contextStatus.reason,
        fallbackAttempted: false
      };
    }

    const response = await awaitWithRuntimeGuard(
      sender({
        type: "save-obsidian-note",
        payload: { vaultName, vaultPath, filePath, content, attachments, downloadedAttachments, downloadedMarkdown, attachmentNames, allowPartialAttachments, htmlSaveDir, fallbackUri, htmlCodeBlockReplacementText: t("htmlAttachmentSavedLine") }
      }, { phase: "native-save" }),
      runtimeGuard,
      "native-save-wait"
    );

    if (!response?.ok) {
      const message = response?.error || "unknown";
      if (isExtensionRuntimeFailure(response)) {
        console.warn("Extension runtime became unavailable before native save.", message);
        notifyRuntimeFailure(response, "native-save");
        return response;
      }
      console.warn("Failed to save Obsidian note through native helper.", message);
      return fallbackToUri(message);
    }

    if (Array.isArray(response.warnings) && response.warnings.length) {
      showAlert(t("generatedArtifactWarningPrefix") + response.warnings.join("\n"));
    }
    if (!allowPartialAttachments && Array.isArray(attachmentNames) && attachmentNames.length) {
      const writtenRequestedNames = Array.isArray(response.attachmentAudit?.writtenRequestedNames)
        ? response.attachmentAudit.writtenRequestedNames
        : Array.isArray(response.attachments)
          ? response.attachments.map(item => item?.requestedName || item?.name || "")
          : [];
      const writtenKeys = new Set(writtenRequestedNames.map(artifactNameKey));
      const missing = Array.from(new Set(attachmentNames
        .map(name => safeArtifactName(name, ["html", "htm"]))
        .filter(name => !writtenKeys.has(artifactNameKey(name)))));
      if (missing.length) {
        const message = t("nativeAttachmentAuditFailed") + missing.slice(0, 12).join(", ");
        showAlert(message);
        return { ...response, ok: false, error: "native-attachment-audit-incomplete", missingAttachments: missing };
      }
    }
    return response;
  }

  function getUserSelection() {
    try {
      const sel = window.getSelection();
      if (!sel) return "";
      const text = String(sel).trim();
      return (text && text.length >= 5) ? text : "";
    } catch { return ""; }
  }

  function closestMessageContainer(el) {
    return el?.closest?.('[data-message-author-role]') ||
      el?.closest?.('article, li, [role="listitem"]') ||
      null;
  }

  function closestArtifactContainer(el) {
    if (!el) return null;

    // GPT 5.6 can render generated file cards as siblings of the narrow
    // data-message-author-role node. Keep answer conversion scoped to the
    // message, but inspect the complete conversation turn for artifacts.
    const turn = el.closest?.("[data-testid^='conversation-turn-']");
    if (turn) return turn;

    const message = closestMessageContainer(el);
    if (!message) return null;

    let node = message;
    for (let depth = 0; depth < 4 && node?.parentElement; depth++) {
      node = node.parentElement;
      if (node.querySelector?.("[class*='artifact-row'], [data-testid*='artifact' i], [data-testid*='file' i]")) {
        return node;
      }
    }
    return message;
  }

  function roleAttrForNode(el) {
    return String(el?.getAttribute?.("data-message-author-role") || "").toLowerCase();
  }

  function getMessageRole(node) {
    const roleAttr = roleAttrForNode(node);
    if (roleAttr.includes("user")) return "user";
    if (roleAttr.includes("assistant")) return "assistant";

    const txt = node?.textContent?.slice(0, 80) || "";
    if (/^(You|사용자)\b/i.test(txt.trim())) return "user";
    if (node?.matches?.("article") && txt.trim()) return "assistant";
    return "";
  }

  function dedupeMessageNodes(nodes) {
    const result = [];
    nodes.forEach(node => {
      if (!getMessageRole(node)) return;
      if (result.some(existing => existing === node || existing.contains?.(node))) return;
      for (let i = result.length - 1; i >= 0; i--) {
        if (node.contains?.(result[i])) result.splice(i, 1);
      }
      result.push(node);
    });
    return result;
  }

  function getAllMessageNodes() {
    const root = document.querySelector('main') || document.body;
    const roleNodes = dedupeMessageNodes(Array.from(root.querySelectorAll('[data-message-author-role]')));
    if (roleNodes.length) return roleNodes;
    return dedupeMessageNodes(Array.from(root.querySelectorAll('article, li, [role="listitem"]')));
  }

  function isUserNode(el) {
    if (getMessageRole(el) === "user") return true;
    const txt = el?.textContent?.slice(0, 50) || "";
    if (/^(You|사용자)\b/i.test(txt)) return true;
    return false;
  }

  function findMessageNodeIndex(nodes, target) {
    const exact = nodes.indexOf(target);
    if (exact >= 0) return exact;
    return nodes.findIndex(node => node === target || node.contains?.(target) || target?.contains?.(node));
  }

  function findPreviousMessageByRole(nodes, startIndex, role) {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (getMessageRole(nodes[i]) === role) return { node: nodes[i], index: i };
    }
    return null;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function restorePromptLineBreaks(text) {
    let code = (text || "").replace(/\r\n?/g, "\n").replace(/\u00A0/g, " ");
    const hasPromptLabels = /\b(?:Role|Personality|Goal|Decision Rules|Output|Safety and Boundaries)(?=[A-Z가-힣-]|\s)/.test(code);
    if (!hasPromptLabels) return text;

    const labels = ["Role", "Personality", "Goal", "Decision Rules", "Output", "Safety and Boundaries"];
    labels.forEach(label => {
      const escaped = escapeRegExp(label);
      code = code
        .replace(new RegExp(`([^\\n])(${escaped})(?=[A-Z가-힣-])`, "g"), "$1\n$2")
        .replace(new RegExp(`(${escaped})(?=[A-Z가-힣])`, "g"), "$1\n");
    });

    return code
      .replace(/([^\n])(-\s+)/g, "$1\n$2")
      .replace(/([.!?。！？])(?=(?:Do not|User requests)\b)/g, "$1\n")
      .replace(/([.!?。！？])(?=(?:Personality|Goal|Decision Rules|Output|Safety and Boundaries)\b)/g, "$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function repairFencedCodeBlocks(md) {
    if (!md) return "";
    return md.replace(/(^|\n)(`{3,})([^\n`]*)\n([\s\S]*?)\n\2(?=\n|$)/g, (match, prefix, fence, lang, code) => {
      return `${prefix}${fence}${lang || ""}\n${restorePromptLineBreaks(code)}\n${fence}`;
    });
  }

  function isPluginMentionContext(node) {
    if (!node?.closest) return false;
    return !!node.closest([
      "[data-id^='plugin:']",
      "[data-plugin-id]",
      "[data-inline-selection-pill]",
      "[data-testid*='plugin' i]"
    ].join(","));
  }

  function isDecorativeContentImage(node) {
    const src = String(node?.getAttribute?.("src") || "").trim();
    if (/(?:^|\/\/)www\.google\.com\/s2\/favicons\b|favicon/i.test(src)) return true;
    if (!src || !isPluginMentionContext(node)) return false;
    try {
      const url = new URL(src, location.href);
      return url.hostname === "chatgpt.com" && /^\/images\/[^/?#]+\/app-blocks-[^/?#]+\.svg$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function nodesIncludingRoot(root, selector) {
    if (!root) return [];
    const nodes = [];
    if (root.matches?.(selector)) nodes.push(root);
    if (root.querySelectorAll) nodes.push(...Array.from(root.querySelectorAll(selector)));
    return Array.from(new Set(nodes));
  }

  function isVisualizePluginId(value) {
    const text = String(value || "").trim().toLowerCase();
    return text === "plugin:visualize";
  }

  function isVisualizePluginMention(node) {
    if (!node) return false;
    const dataId = String(node.getAttribute?.("data-id") || "").trim();
    const dataPluginId = String(node.getAttribute?.("data-plugin-id") || "").trim();
    if (dataId.toLowerCase() === "plugin:visualize" || isVisualizePluginId(dataPluginId)) return true;

    const iconNodes = nodesIncludingRoot(node, "img, svg, [data-src]");
    for (const icon of iconNodes) {
      const rawSrc = String(
        icon.getAttribute?.("src") ||
        icon.getAttribute?.("data-src") ||
        icon.getAttribute?.("href") ||
        ""
      ).trim();
      if (!rawSrc) continue;
      try {
        const iconUrl = new URL(rawSrc, location.href);
        if (iconUrl.hostname === "chatgpt.com" && iconUrl.pathname === "/images/visualize/app-blocks-visualize.svg") {
          return true;
        }
      } catch {}
    }

    return false;
  }

  function isVisualizeRequestNode(node) {
    return verifiedVisualizeRequestMarkerNodes(node).length > 0;
  }

  function hasEarlierAssistantResponseVariant(currentAssistantNode) {
    const currentTurn = currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || null;
    const turnRoot = currentTurn || currentAssistantNode;
    if (!turnRoot?.querySelectorAll) return false;
    return nodesIncludingRoot(turnRoot, "button, [role='button']").some(control => {
      const label = String(control.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim();
      if (!/^(?:previous response|이전 응답)$/i.test(label)) return false;
      if (!isVisibleEnabledControl(control)) return false;
      const controlTurn = control.closest?.("[data-testid^='conversation-turn-']") || null;
      return !currentTurn || controlTurn === currentTurn;
    });
  }

  function isVisualizeRequestForAssistant(requestNode, currentAssistantNode) {
    if (isVisualizeRequestNode(requestNode)) return true;
    const requestText = String(requestNode?.innerText || requestNode?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return /^@?visualize$/i.test(requestText) &&
      hasEarlierAssistantResponseVariant(currentAssistantNode);
  }

  function isVisualizeShareCandidate(currentAssistantNode, previousQa) {
    return collectRichAppBlockCandidates(currentAssistantNode).length > 0 &&
      isVisualizeRequestForAssistant(previousQa?.requestNode, currentAssistantNode);
  }

  function removeUnsupportedRichAppBlocks(root) {
    const blocks = nodesIncludingRoot(root, '[data-app-block-preview="true"]');
    blocks.forEach(block => block.remove?.());
    return blocks.length;
  }

  function isInsideUnsupportedRichAppBlock(node) {
    return !!node?.closest?.('[data-app-block-preview="true"]');
  }

  function hasNonRichSelectorMatch(container, selector) {
    if (!container) return false;
    const first = container.querySelector?.(selector) || null;
    if (first && !isInsideUnsupportedRichAppBlock(first)) return true;
    if (!first && typeof container.querySelector === "function") return false;
    return Array.from(container.querySelectorAll?.(selector) || [])
      .some(node => !isInsideUnsupportedRichAppBlock(node));
  }

  function normalizeFileCitationChips(root) {
    const chips = nodesIncludingRoot(root, "[data-file-citation-primary-source]");
    chips.forEach(chip => {
      const displayName = String(chip.innerText || chip.textContent || "").replace(/\s+/g, " ").trim();
      if (!displayName || typeof chip.replaceWith !== "function") return;
      const replacement = document.createElement("span");
      replacement.setAttribute?.("data-gpt2obs-source-file", "true");
      replacement.textContent = `${t("sourceFileDisplayName")}${displayName}`;
      chip.replaceWith(replacement);
    });
    return chips.length;
  }

  // ---------- HTML → Markdown (lightweight) ----------
  function htmlToMarkdown(html) {
    const el = document.createElement("div");
    el.innerHTML = html;

    function escapeMd(s) {
      return s.replace(/([*_`~])/g, "\\$1");
    }

    function stripDecorativeMarkdownImages(text) {
      return String(text || "")
        .replace(/!\[[^\]]*\]\((?:https?:\/\/www\.google\.com\/s2\/favicons[^)]*|[^)]*favicon[^)]*)\)/gi, "")
        .trim();
    }

    function extractPreText(pre) {
      const root = pre.querySelector("code") || pre;
      const rendered = (root.innerText || "").replace(/\r\n?/g, "\n");
      if (rendered.includes("\n")) return rendered;

      function collect(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
        if (node.nodeType !== Node.ELEMENT_NODE) return "";

        const tag = node.tagName.toLowerCase();
        if (tag === "br") return "\n";

        const text = Array.from(node.childNodes).map(collect).join("");
        if (/^(div|p|li|section|article|tr)$/i.test(tag) && text.trim()) {
          return text.replace(/\n+$/g, "") + "\n";
        }
        return text;
      }

      return collect(root) || root.textContent || "";
    }

    function repairCollapsedPromptCode(text, aggressive = false) {
      const labels = [
        "목표", "중요", "중요 규칙", "접근 규칙", "출력 형식", "출력 방식", "HTML 구성", "반드시 지킬 점", "수정 방식",
        "검수 대상", "검수 기준", "찾을 대상", "대상 문서", "대상 장",
        "페이지 범위", "시작 문구", "끝 문구", "요청", "파일명",
        "프로젝트 지침", "매번 넣는 프롬프트", "처음 한 번", "매 장마다",
        "출처 페이지", "웹페이지 주소", "제공 텍스트", "안정성 우선", "편의성 우선", "파일 생성이 불가능한 환경이면",
        "Role", "Personality", "Goal", "Decision Rules", "Output", "Safety and Boundaries"
      ];

      let code = text;

      code = code
        .replace(/^(\[[^\]\n]{2,40}\])(?=\S)/, "$1\n")
        .replace(/([^\n])(\[[^\]\n]{2,40}\])/g, "$1\n$2")
        .replace(/([^\n])([─━]{6,})/g, "$1\n$2")
        .replace(/([─━]{6,})([^\n])/g, "$1\n$2");

      labels.forEach(label => {
        const escaped = escapeRegExp(label);
        code = code
          .replace(new RegExp(`([^\\n])(${escaped}\\s*[:=])`, "g"), "$1\n$2")
          .replace(new RegExp(`(${escaped}\\s*[:=])(?=\\S)`, "g"), "$1\n");
      });

      code = code
        .replace(/([^\n])(파일명은\s+)/g, "$1\n$2")
        .replace(/파일명\n은/g, "파일명은")
        .replace(/([^\n\s])(\d+\.\s+)/g, "$1\n$2")
        .replace(/([^\n])(-\s+)/g, "$1\n$2");

      if (aggressive) {
        code = code.replace(/([.!?。！？])(?=[가-힣A-Z\[])/g, "$1\n");
      }

      return code.replace(/\n{3,}/g, "\n\n").trim();
    }

    function formatCapturedCodeBlock(text) {
      let code = (text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/\n$/, "");

      const meaningfulLines = code.split("\n").filter(l => l.trim()).length;
      const looksLikeKoreanPrompt = /[가-힣]/.test(code);
      const looksLikeRealCode = /^\s*(?:<!doctype|<html\b|<\?xml|function\b|const\b|let\b|var\b|class\b|import\b|export\b)/i.test(code);

      if (!looksLikeKoreanPrompt || looksLikeRealCode) {
        return code;
      }

      return repairCollapsedPromptCode(code, meaningfulLines <= 1 && code.length >= 40);
    }

    function codeFenceFor(code) {
      const longest = (code.match(/`+/g) || []).reduce((max, ticks) => Math.max(max, ticks.length), 0);
      return "`".repeat(Math.max(3, longest + 1));
    }

    function cellText(cell) {
      return Array.from(cell.childNodes)
        .map(n => walk(n, {listDepth:0, olIndex:1}))
        .join("")
        .replace(/\s+/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
    }

    function tableToMarkdown(table) {
      const rows = Array.from(table.querySelectorAll("tr")).map(tr => {
        return Array.from(tr.children)
          .filter(cell => /^(th|td)$/i.test(cell.tagName || ""))
          .map(cellText);
      }).filter(row => row.length);

      if (!rows.length) return "";

      const width = Math.max(...rows.map(row => row.length));
      const normalized = rows.map(row => {
        const copy = row.slice();
        while (copy.length < width) copy.push("");
        return copy;
      });
      const hasHeader = table.querySelector("th") || normalized.length > 1;
      const header = hasHeader ? normalized[0] : normalized[0].map((_, i) => `Column ${i + 1}`);
      const body = hasHeader ? normalized.slice(1) : normalized;
      const lines = [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...body.map(row => `| ${row.join(" | ")} |`)
      ];

      return `\n${lines.join("\n")}\n`;
    }

    function walk(node, ctx = {listDepth:0, olIndex:1}) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue.replace(/\u00A0/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }
      if (node.matches?.(".katex-display")) {
        const tex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "";
        if (tex.trim()) return `\n$$\n${tex.trim()}\n$$\n`;
      }
      if (node.matches?.(".katex") && !node.parentElement?.closest?.(".katex-display")) {
        const tex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "";
        if (tex.trim()) return `$${tex.trim()}$`;
      }
      const tag = node.tagName.toLowerCase();
      const child = () => Array.from(node.childNodes).map(n => walk(n, ctx)).join("");

      switch (tag) {
        case "br": return "\n";
        case "hr": return "\n---\n";
        case "strong":
        case "b": return `**${child()}**`;
        case "em":
        case "i": return `*${child()}*`;
        case "code":
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") return child();
          return "`" + child().replace(/\n+/g, ' ') + "`";
        case "pre": {
          const code = formatCapturedCodeBlock(extractPreText(node).replace(/\n$/, ""));
          const fence = codeFenceFor(code);
          return "\n" + fence + "\n" + code + "\n" + fence + "\n";
        }
        case "table":
          return tableToMarkdown(node);
        case "thead":
        case "tbody":
        case "tfoot":
        case "tr":
        case "th":
        case "td":
          return child();
        case "a": {
          const href = String(node.getAttribute("href") || "").trim();
          const text = stripDecorativeMarkdownImages(child()) || href;
          // ChatGPT can render generated-file controls as anchors without an
          // href and keep the real destination only in a React click handler.
          // Markdown has no equivalent for that hidden handler, so preserve
          // the label as plain text instead of manufacturing `[name]()`.
          if (!href) return text;
          return `[${text}](${href})`;
        }
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const level = parseInt(tag[1], 10);
          return `\n${"#".repeat(level)} ${child()}\n`;
        }
        case "p":
        case "div": {
          let inner = child();
          // treat empty divs as line breaks
          if (!inner.trim()) return "\n";
          return `\n${inner}\n`;
        }
        case "ul": {
          const items = Array.from(node.children).filter(n => n.tagName && n.tagName.toLowerCase() === "li")
            .map(li => {
              const saved = { ...ctx };
              ctx.listDepth++;
              const text = walk(li, ctx).trim().replace(/\n/g, "\n  ");
              ctx.listDepth = saved.listDepth;
              return `- ${text}`;
            }).join("\n");
          return `\n${items}\n`;
        }
        case "ol": {
          let i = 1;
          const items = Array.from(node.children).filter(n => n.tagName && n.tagName.toLowerCase() === "li")
            .map(li => {
              const saved = { ...ctx };
              ctx.listDepth++;
              const text = walk(li, ctx).trim().replace(/\n/g, "\n   ");
              ctx.listDepth = saved.listDepth;
              return `${i++}. ${text}`;
            }).join("\n");
          return `\n${items}\n`;
        }
        case "li": {
          return child();
        }
        case "blockquote": {
          const inner = child().split(/\r?\n/).map(l => l ? `> ${l}` : ">").join("\n");
          return `\n${inner}\n`;
        }
        case "img": {
          const alt = node.getAttribute("alt") || "";
          const src = node.getAttribute("src") || "";
          if (isDecorativeContentImage(node)) return "";
          return `![${alt}](${src})`;
        }
      }
      return child();
    }

    const result = walk(el).replace(/\n{3,}/g, "\n\n").trim();
    return result;
  }

  function shouldRemoveButton(button) {
    const text = (button.innerText || button.textContent || "").trim();
    const aria = button.getAttribute("aria-label") || "";
    const testid = button.getAttribute("data-testid") || "";
    const title = button.getAttribute("title") || "";
    const marker = `${text} ${aria} ${testid} ${title}`;

    if (button.classList?.contains("gpt2obs-btn") || text === "Obsidian 저장" || text === "Save to Obsidian") return true;
    if (/citation|source|출처|인용|근거/i.test(marker)) return false;
    if (!text) return true;

    return /copy|복사|read aloud|소리내어|good response|bad response|regenerate|share|edit|more|더보기|menu|메뉴/i.test(marker);
  }

  function removeNonAnswerChrome(root) {
    if (!root) return;
    try {
      root.querySelectorAll("button").forEach(button => {
        if (shouldRemoveButton(button)) button.remove();
      });
      root.querySelectorAll("nav, menu, style, svg, path").forEach(n => n.remove());
    } catch {}
  }

  function removePreviousQaMarkdownChrome(root) {
    removeNonAnswerChrome(root);
    try {
      root.querySelectorAll([
        ".gpt2obs-btn",
        "button",
        "menu",
        "nav",
        "[role='toolbar']",
        "[data-testid*='copy' i]",
        "[data-testid*='menu' i]",
        "[data-testid*='citation' i]",
        "[data-testid*='toolbar' i]",
        "[aria-label*='copy' i]",
        "[aria-label*='menu' i]",
        "[aria-label*='citation' i]",
        "[aria-label*='source' i]",
        "[aria-label*='출처' i]"
      ].join(",")).forEach(n => n.remove());
    } catch {}
  }

  function stripChatGptFooterLines(md) {
    if (!md) return "";
    const lines = md.split(/\r?\n/);
    let i = lines.length - 1;
    while (i >= 0 && !lines[i].trim()) i--;

    const statsLine = /^\d[\d,]*\s+chars\s*•\s*\d[\d,]*\s+words$/i;
    const timeLine = /^(?:Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}[.-]\d{1,2}[.-]\d{1,2})\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*•?$/;
    const combinedLine = /(?:Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}[.-]\d{1,2}[.-]\d{1,2})\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*•\s*\d[\d,]*\s+chars\s*•\s*\d[\d,]*\s+words$/i;

    if (i >= 0 && combinedLine.test(lines[i].trim())) {
      lines.splice(i, 1);
      return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    if (i >= 0 && statsLine.test(lines[i].trim())) {
      lines.splice(i, 1);
      i--;
      while (i >= 0 && !lines[i].trim()) {
        lines.splice(i, 1);
        i--;
      }
      if (i >= 0 && timeLine.test(lines[i].trim())) {
        lines.splice(i, 1);
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function extractAssistantMessageHTML(btn) {
    const container = closestMessageContainer(btn);
    if (!container) return "";
    const clone = container.cloneNode(true);
    normalizeFileCitationChips(clone);
    removeUnsupportedRichAppBlocks(clone);
    removeNonAnswerChrome(clone);
    return clone.innerHTML;
  }

  function messageNodeToPlainText(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    normalizeFileCitationChips(clone);
    removeUnsupportedRichAppBlocks(clone);
    removePreviousQaMarkdownChrome(clone);
    const markdown = htmlToMarkdown(clone.innerHTML || "");
    if (markdown && markdown.length >= 3) return markdown.trim();
    return (clone.innerText || clone.textContent || "").trim();
  }

  function assistantNodeToMarkdown(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    normalizeFileCitationChips(clone);
    removeUnsupportedRichAppBlocks(clone);
    removePreviousQaMarkdownChrome(clone);
    const md = htmlToMarkdown(clone.innerHTML || "");
    return stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(md || "")));
  }

  function findPreviousQaPair(currentAssistantNode, nodes = getAllMessageNodes(), options = {}) {
    const currentIndex = findMessageNodeIndex(nodes, currentAssistantNode);
    if (currentIndex < 0 || getMessageRole(nodes[currentIndex]) !== "assistant") return null;

    const request = findPreviousMessageByRole(nodes, currentIndex, "user");
    if (!request) return null;
    const answer = findPreviousMessageByRole(nodes, request.index, "assistant");
    if (!answer) return null;
    const question = findPreviousMessageByRole(nodes, answer.index, "user");
    if (!question) return null;

    const extractQuestion = options.extractQuestion || questionNodeToPlainText;
    const extractAnswer = options.extractAnswer || assistantNodeToMarkdown;
    const questionText = cleanQuestionText(extractQuestion(question.node) || "");
    const answerText = stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(extractAnswer(answer.node) || "")));

    if (!questionText || !answerText) return null;

    return {
      questionNode: question.node,
      answerNode: answer.node,
      requestNode: request.node,
      questionText,
      answerText
    };
  }

  // Direct Visualize saves are intentionally resolved separately from the
  // legacy Q1/A1 finder.  The latter is also used by ordinary and HTML
  // captures, so changing its meaning would make a missing/virtualized Q1/A1
  // pair look like a valid direct capture.
  function isExplicitVisualizeRequestNode(node) {
    return verifiedVisualizeRequestMarkerNodes(node).length > 0;
  }

  function verifiedVisualizeRequestMarkerNodes(root) {
    if (!root) return [];
    const exactIdMarkers = nodesIncludingRoot(root, "[data-id], [data-plugin-id]").filter(candidate => {
      const dataId = String(candidate.getAttribute?.("data-id") || "").trim().toLowerCase();
      const pluginId = String(candidate.getAttribute?.("data-plugin-id") || "").trim().toLowerCase();
      return dataId === "plugin:visualize" || pluginId === "plugin:visualize";
    });

    const iconMarkers = [];
    for (const icon of nodesIncludingRoot(root, "img, svg, [data-src]")) {
      if (!isVisualizePluginMention(icon)) continue;
      let current = icon.parentElement || null;
      let marker = null;
      while (current && current !== root) {
        const text = String(current.innerText || current.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const hasPluginStructure = nodesIncludingRoot(current, [
          "[data-id^='plugin:']",
          "[data-plugin-id]",
          "[data-inline-selection-pill]",
          "[data-testid*='plugin' i]"
        ].join(",")).length > 0;
        if (hasPluginStructure && /^@?visualize$/i.test(text)) marker = current;
        current = current.parentElement || null;
      }
      if (marker) iconMarkers.push(marker);
    }

    const candidates = Array.from(new Set([...exactIdMarkers, ...iconMarkers]));
    const containsDescendant = (ancestor, descendant) => {
      let current = descendant?.parentElement || null;
      while (current) {
        if (current === ancestor) return true;
        current = current.parentElement || null;
      }
      return false;
    };
    return candidates.filter(candidate => !candidates.some(other =>
      other !== candidate && containsDescendant(other, candidate)
    ));
  }

  function removeVerifiedVisualizeRequestMarker(marker) {
    const parent = marker?.parentElement || null;
    const siblings = parent?.childNodes || [];
    const index = Array.prototype.indexOf.call(siblings, marker);
    const previous = index > 0 ? siblings[index - 1] : null;
    const next = index >= 0 && index + 1 < siblings.length ? siblings[index + 1] : null;
    const boundaryTextNode = (node, fromEnd) => {
      let current = node;
      while (current && current.nodeType !== 3) {
        const children = current.childNodes || [];
        if (!children.length) return null;
        current = fromEnd ? children[children.length - 1] : children[0];
      }
      return current?.nodeType === 3 ? current : null;
    };
    const previousTextNode = boundaryTextNode(previous, true);
    const nextTextNode = boundaryTextNode(next, false);

    // The live ChatGPT marker sits between two authored text nodes. Replace
    // only that structural seam with one space; do not flatten line breaks or
    // other whitespace elsewhere in the user's prompt.
    if (previousTextNode && nextTextNode) {
      const previousRaw = String(previousTextNode.nodeValue ?? previousTextNode.textContent ?? "");
      const nextRaw = String(nextTextNode.nodeValue ?? nextTextNode.textContent ?? "");
      const trailingWhitespace = previousRaw.match(/[\s\u00a0]*$/u)?.[0] || "";
      const leadingWhitespace = nextRaw.match(/^[\s\u00a0]*/u)?.[0] || "";
      const previousText = trailingWhitespace
        ? previousRaw.slice(0, previousRaw.length - trailingWhitespace.length)
        : previousRaw;
      const nextText = nextRaw.slice(leadingWhitespace.length);
      const separator = previousText && nextText
        ? /[\r\n]/.test(trailingWhitespace) ? "\n" : " "
        : "";
      previousTextNode.nodeValue = `${previousText}${separator}`;
      nextTextNode.nodeValue = nextText;
    }
    marker.remove?.();
  }

  function questionNodeToPlainText(node) {
    if (!node) return "";
    let source = node;
    try {
      const clone = node.cloneNode?.(true);
      if (clone && clone !== node) {
        verifiedVisualizeRequestMarkerNodes(clone).forEach(removeVerifiedVisualizeRequestMarker);
        source = clone;
      }
    } catch {}
    return cleanQuestionText(messageNodeToPlainText(source));
  }

  function visualizeRequestNodeToPlainText(node) {
    return questionNodeToPlainText(node);
  }

  function isPreviousAnswerVisualizationRequestText(value) {
    const text = String(value || "")
      .normalize("NFKC")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!text) return false;

    // Remove explicit negative references before looking for affirmative
    // provenance. This keeps phrases such as "do not use this answer" from
    // silently selecting A1 while still allowing a later affirmative
    // "use the previous answer" clause to be recognized.
    const affirmativeText = text
      .replace(
        /\b(?:do\s+not|don't|never)\s+(?:use|reuse|reference|include|visualize|base\s+(?:this|it)\s+on)\s+(?:(?:this|that|the|your|previous|prior|last|earlier|above)\s+)?(?:answer|response|reply|explanation|content)\b/g,
        " "
      )
      .replace(
        /(?:바로\s*)?(?:위(?:의|에\s*있는)?|이전(?:의)?|직전(?:의)?|앞(?:의|선)?|마지막(?:의)?)\s*(?:답변|응답|설명|내용)\s*(?:은|는|이|가|을|를)?\s*(?:말고|아니라|아닌|아니고)/g,
        " "
      )
      .replace(
        /(?:이|그|위(?:의|에\s*있는)?|이전(?:의)?|직전(?:의)?|앞(?:의|선)?|마지막(?:의)?)\s*(?:답변|응답|설명|내용)\s*(?:을|를)?\s*(?:사용|참조|활용|시각화)하지\s*말(?:고|아|라)?/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

    const koreanReferences = [
      /(?:바로\s*)?(?:위(?:의|에\s*있는)?|이전(?:의)?|직전(?:의)?|앞(?:의|선)?|마지막(?:의)?)\s*(?:답변|응답|설명|내용)/,
      /(?:방금|조금\s*전)\s*(?:답(?:한|해\s*준)|응답(?:한|해\s*준)|설명(?:한|해\s*준)|말(?:한|해\s*준)|작성(?:한|해\s*준))\s*(?:답변|응답|설명|내용|것)?/
    ];
    if (koreanReferences.some(pattern => pattern.test(affirmativeText))) return true;
    if (/^(?:이|그)\s*(?:답변|응답|설명|내용)\s*(?:을|를)/.test(affirmativeText)) return true;

    const englishReferences = [
      /\b(?:(?:the|your)\s+)?(?:previous|prior|last|preceding|earlier|above)\s+(?:answer|response|reply|explanation|content)\b/,
      /\b(?:answer|response|reply|explanation|content)\s+(?:above|before)\b/,
      /\bwhat\s+(?:you\s+)?(?:just|previously)\s+(?:said|answered|explained|wrote)\b/,
      /\b(?:answer|response|reply|explanation)\s+(?:you\s+)?(?:just|previously)\s+(?:gave|provided|wrote|explained)\b/
    ];
    if (englishReferences.some(pattern => pattern.test(affirmativeText))) return true;
    return /^(?:please\s+)?(?:visualize|turn|show|render|convert|make|create)\b[^.!?;]{0,100}\bthis\s+(?:answer|response|reply|explanation|content)\b/.test(affirmativeText);
  }

  function extractDirectVisualizeExplanation(node) {
    if (!node) return "";
    try {
      const clone = node.cloneNode?.(true);
      if (clone && clone !== node) {
        removeUnsupportedRichAppBlocks(clone);
        removePreviousQaMarkdownChrome(clone);
        const markdown = htmlToMarkdown(clone.innerHTML || "");
        return stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(markdown || "")));
      }
    } catch {}
    // Test doubles and a few lightweight DOM wrappers return themselves from
    // cloneNode(); use their already-scoped text without mutating the live app
    // block in that case.
    return stripChatGptFooterLines(cleanAnswerText(String(node.innerText || node.textContent || "").trim()));
  }

  function getVerifiedConversationTurnEntries(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    const roots = Array.from(scope.querySelectorAll?.("[data-testid^='conversation-turn-']") || []);
    const topLevelRoots = roots.filter(root => !roots.some(other => (
      other !== root && other.contains?.(root) && other.matches?.("[data-testid^='conversation-turn-']")
    )));
    const entries = [];

    topLevelRoots.forEach((turn, order) => {
      const declaredRole = String(turn.getAttribute?.("data-turn") || "").trim().toLowerCase();
      const roleNodes = nodesIncludingRoot(turn, "[data-message-author-role]");
      const qaRoleNodes = roleNodes.filter(node => {
        const role = roleAttrForNode(node);
        return role === "user" || role === "assistant";
      });

      if (declaredRole && declaredRole !== "user" && declaredRole !== "assistant") {
        if (qaRoleNodes.length > 0) {
          entries.push({ turn, order, ambiguous: true, role: "" });
        }
        return;
      }

      if (declaredRole === "user" || declaredRole === "assistant") {
        if (qaRoleNodes.length !== 1 || roleAttrForNode(qaRoleNodes[0]) !== declaredRole) {
          entries.push({ turn, order, ambiguous: true, role: "" });
          return;
        }
        entries.push({ turn, order, ambiguous: false, role: declaredRole, node: qaRoleNodes[0] });
        return;
      }

      if (qaRoleNodes.length === 1) {
        entries.push({ turn, order, ambiguous: false, role: roleAttrForNode(qaRoleNodes[0]), node: qaRoleNodes[0] });
      } else if (qaRoleNodes.length > 1) {
        entries.push({ turn, order, ambiguous: true, role: "" });
      }
    });
    return entries;
  }

  function conversationRouteKey() {
    const href = String(location?.href || "").trim();
    if (!href) return "";
    try {
      const url = new URL(href);
      url.hash = "";
      return url.href;
    } catch {
      return href.split("#", 1)[0];
    }
  }

  function verifiedTurnIdentity(entry) {
    const turn = entry?.turn || null;
    const node = entry?.node || null;
    if (!turn || !node) return "";
    const turnId = String(
      turn.getAttribute?.("data-turn-id") ||
      turn.getAttribute?.("data-message-id") ||
      node.getAttribute?.("data-message-id") ||
      ""
    ).trim();
    const testId = String(turn.getAttribute?.("data-testid") || "").trim();
    const elementId = String(turn.getAttribute?.("id") || "").trim();
    // Use the strongest available identity, rather than a composite of stable
    // and presentation attributes. ChatGPT may change data-testid/id when a
    // virtualized turn remounts while preserving its actual turn/message ID.
    if (turnId) return `turn:${turnId}`;
    if (testId) return `test:${testId}`;
    if (elementId) return `id:${elementId}`;
    return "";
  }

  function verifiedTurnContainerIdentity(entry) {
    const turn = entry?.turn || null;
    if (!turn) return "";
    const turnId = String(
      turn.getAttribute?.("data-turn-id") ||
      turn.getAttribute?.("data-message-id") ||
      ""
    ).trim();
    const testId = String(turn.getAttribute?.("data-testid") || "").trim();
    const elementId = String(turn.getAttribute?.("id") || "").trim();
    if (turnId) return `turn:${turnId}`;
    if (testId) return `test:${testId}`;
    if (elementId) return `id:${elementId}`;
    return "";
  }

  function stableTurnFingerprint(value) {
    const text = String(value || "");
    let first = 2166136261;
    let second = 5381;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 16777619);
      second = ((second << 5) + second) ^ code;
    }
    return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
  }

  function hydrationTurnText(entry) {
    const node = entry?.node || null;
    if (!node) return "";
    if (entry.role === "user") {
      const text = isVisualizeRequestNode(node)
        ? visualizeRequestNodeToPlainText(node)
        : cleanQuestionText(messageNodeToPlainText(node));
      return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }
    let cloneIsIndependent = true;
    try {
      cloneIsIndependent = node.cloneNode?.(true) !== node;
    } catch {
      cloneIsIndependent = false;
    }
    const rendered = cloneIsIndependent
      ? assistantNodeToMarkdown(node)
      : String(node.innerText || node.textContent || "");
    return stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(
      rendered || String(node.innerText || node.textContent || "")
    )));
  }

  function hydrationRichAppStructure(node) {
    if (!node) return [];
    return nodesIncludingRoot(node, '[data-app-block-preview="true"]').map(block => {
      const iframes = Array.from(block.querySelectorAll?.("iframe") || []);
      return {
        marker: String(block.getAttribute?.("data-app-block-preview") || ""),
        iframeCount: iframes.length,
        iframeSourceFingerprints: iframes.map(iframe => stableTurnFingerprint([
          String(iframe.getAttribute?.("src") || "").trim(),
          String(iframe.getAttribute?.("srcdoc") || "")
        ].join("\u0000")))
      };
    });
  }

  function hydrationTurnProof(entry) {
    if (!entry || entry.ambiguous || !entry.node || !entry.role) return "";
    // Capture the rich-app structure before Markdown extraction. Real DOM
    // extraction works on a clone; taking this first also keeps lightweight
    // test doubles from hiding a runtime swap by mutating their fake clone.
    const richAppStructure = entry.role === "assistant"
      ? hydrationRichAppStructure(entry.node)
      : [];
    return {
      role: entry.role,
      text: hydrationTurnText(entry),
      explicitVisualize: entry.role === "user" && isExplicitVisualizeRequestNode(entry.node),
      richAppStructure
    };
  }

  function hydrationTurnFingerprintFromProof(proof) {
    return proof ? stableTurnFingerprint(JSON.stringify(proof)) : "";
  }

  function hydrationTurnCoreFingerprintFromProof(proof) {
    if (!proof) return "";
    return stableTurnFingerprint(JSON.stringify({
      role: proof.role,
      text: proof.text,
      explicitVisualize: proof.explicitVisualize,
      richAppBlockMarkers: Array.from(proof.richAppStructure || []).map(item => ({
        marker: String(item?.marker || "")
      }))
    }));
  }

  function hydrationTurnFingerprint(entry) {
    return hydrationTurnFingerprintFromProof(hydrationTurnProof(entry));
  }

  function captureHydrationTurn(entry) {
    const key = verifiedTurnIdentity(entry);
    const proof = hydrationTurnProof(entry);
    const fingerprint = hydrationTurnFingerprintFromProof(proof);
    if (!key || !fingerprint || entry?.ambiguous) return null;
    return {
      key,
      role: entry.role,
      fingerprint,
      coreFingerprint: hydrationTurnCoreFingerprintFromProof(proof),
      richAppStructure: Array.from(proof?.richAppStructure || [])
    };
  }

  function captureFollowingHydrationNavigationAnchor(entries, a2Entry, scrollContainer) {
    const a2Index = Array.from(entries || []).indexOf(a2Entry);
    if (a2Index < 0 || !scrollContainer) return null;
    const following = Array.from(entries || []).slice(a2Index + 1)
      .find(entry => entry?.ambiguous || entry?.role === "user" || entry?.role === "assistant");
    if (!following || following.ambiguous || !following.turn) return null;
    const snapshot = captureHydrationTurn(following);
    const containerIdentity = verifiedTurnContainerIdentity(following);
    if (!snapshot || !containerIdentity || containerIdentity !== snapshot.key) return null;
    const primaryIdentityMatches = Array.from(entries || [])
      .filter(entry => verifiedTurnIdentity(entry) === snapshot.key);
    const containerIdentityMatches = Array.from(entries || [])
      .filter(entry => verifiedTurnContainerIdentity(entry) === containerIdentity);
    if (primaryIdentityMatches.length !== 1 || primaryIdentityMatches[0] !== following ||
        containerIdentityMatches.length !== 1 || containerIdentityMatches[0] !== following) return null;
    let turnTop = NaN;
    let scrollTop = NaN;
    try {
      turnTop = Number(following.turn.getBoundingClientRect?.().top);
      scrollTop = Number(scrollContainer.getBoundingClientRect?.().top);
    } catch {}
    const relativeTop = turnTop - scrollTop;
    if (!Number.isFinite(turnTop) || !Number.isFinite(scrollTop) || !Number.isFinite(relativeTop)) return null;
    return Object.freeze({
      snapshot: Object.freeze({ ...snapshot }),
      relativeTop
    });
  }

  function findHydrationTurnIdentity(entries, snapshot) {
    if (!snapshot?.key) return { status: "conflict", reason: "virtualized turn identity is missing" };
    const matches = entries.filter(entry => verifiedTurnIdentity(entry) === snapshot.key);
    if (!matches.length) return { status: "missing" };
    if (matches.length !== 1) {
      return { status: "conflict", reason: "virtualized turn overlap has duplicate identities" };
    }
    const entry = matches[0];
    if (entry.ambiguous || entry.role !== snapshot.role) {
      return { status: "conflict", reason: "virtualized turn overlap role conflict" };
    }
    return { status: "found", entry };
  }

  function findHydrationTurn(entries, snapshot) {
    const identityMatch = findHydrationTurnIdentity(entries, snapshot);
    if (identityMatch.status !== "found") return identityMatch;
    const entry = identityMatch.entry;
    if (hydrationTurnFingerprint(entry) !== snapshot.fingerprint) {
      return { status: "conflict", reason: "virtualized turn overlap fingerprint mismatch" };
    }
    return { status: "found", entry };
  }

  function hydrationRichAppBlockShape(structure) {
    return Array.from(structure || []).map(item => ({
      marker: String(item?.marker || "")
    }));
  }

  function hydrationIframeSourceFingerprints(structure) {
    return Array.from(structure || []).flatMap(item =>
      Array.from(item?.iframeSourceFingerprints || []).map(value => String(value || ""))
    );
  }

  function sameFingerprintMultiset(first, second) {
    const left = Array.from(first || []).map(String).sort();
    const right = Array.from(second || []).map(String).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function findHydrationA2DuringVerifiedShare(entries, snapshot, transition = {}) {
    const identityMatch = findHydrationTurnIdentity(entries, snapshot);
    if (identityMatch.status !== "found") return identityMatch;
    const entry = identityMatch.entry;
    const currentProof = hydrationTurnProof(entry);
    const exactFingerprint = hydrationTurnFingerprintFromProof(currentProof) === snapshot?.fingerprint;
    if (!currentProof || !snapshot?.coreFingerprint ||
        hydrationTurnCoreFingerprintFromProof(currentProof) !== snapshot.coreFingerprint) {
      return { status: "conflict", reason: "virtualized A2 authored content changed during Share" };
    }

    const expectedStructure = Array.from(snapshot.richAppStructure || []);
    const currentStructure = Array.from(currentProof.richAppStructure || []);
    const expectedShape = hydrationRichAppBlockShape(expectedStructure);
    if (!expectedStructure.length ||
        expectedStructure.some(item => Number(item?.iframeCount || 0) !== Array.from(item?.iframeSourceFingerprints || []).length) ||
        JSON.stringify(hydrationRichAppBlockShape(currentStructure)) !== JSON.stringify(expectedShape)) {
      return { status: "conflict", reason: "virtualized A2 app-block wrapper changed during Share" };
    }

    const expectedSources = hydrationIframeSourceFingerprints(expectedStructure);
    const currentSources = hydrationIframeSourceFingerprints(currentStructure);
    if (!expectedSources.length) {
      return { status: "conflict", reason: "virtualized A2 iframe relocation proof is missing" };
    }

    if (transition.mode === "surface" || transition.mode === "copy-success-surface") {
      const surface = transition.surface || null;
      const surfaceVisible = surface ? shareSurfaceVisibilityDetails(surface).visible : false;
      const verifiedCopySuccessState = transition.mode === "copy-success-surface" &&
        transition.copyClicked === true &&
        transition.copySignalObserved === true &&
        copySuccessEntries(surface, null).length > 0;
      if (transition.shareKind !== "response" || !surface || surface.isConnected === false ||
          entry.node.contains?.(surface) ||
          (classifyShareSurface(surface) !== "final" && !verifiedCopySuccessState) ||
          !surfaceVisible) {
        return { status: "conflict", reason: VERIFIED_RESPONSE_SHARE_SURFACE_MISSING };
      }
      const surfaceStructure = hydrationRichAppStructure(surface);
      const surfaceSources = hydrationIframeSourceFingerprints(surfaceStructure);
      if (exactFingerprint) {
        if (surfaceSources.length !== 0) {
          return { status: "conflict", reason: RESPONSE_SHARE_IFRAME_DUPLICATED };
        }
        return { status: "found", entry };
      }
      if (JSON.stringify(hydrationRichAppBlockShape(surfaceStructure)) !== JSON.stringify(expectedShape) ||
          currentSources.length !== 0 || !sameFingerprintMultiset(surfaceSources, expectedSources)) {
        return { status: "conflict", reason: RESPONSE_SHARE_IFRAME_RELOCATION_MISMATCH };
      }
      return { status: "found", entry, shareRelocationVerified: true };
    }

    if (transition.mode === "verified") {
      if (currentSources.length !== 0 && !sameFingerprintMultiset(currentSources, expectedSources)) {
        return { status: "conflict", reason: "verified A2 iframe state changed after Share" };
      }
      return { status: "found", entry };
    }

    return { status: "conflict", reason: "virtualized A2 Share transition proof is missing" };
  }

  function resolveConversationScrollContainer(currentTurn, { root = document } = {}) {
    if (!currentTurn) return null;
    let candidate = currentTurn.parentElement || null;
    while (candidate) {
      const clientHeight = Number(candidate.clientHeight || 0);
      const scrollHeight = Number(candidate.scrollHeight || 0);
      if (clientHeight > 0 && scrollHeight > clientHeight + 2) {
        let overflowY = "";
        try {
          overflowY = String(candidate.ownerDocument?.defaultView?.getComputedStyle?.(candidate)?.overflowY || "").toLowerCase();
        } catch {}
        if (/^(?:auto|scroll|overlay)$/.test(overflowY)) {
          return candidate;
        }
      }
      candidate = candidate.parentElement || null;
    }
    const doc = root?.nodeType === 9 ? root : currentTurn.ownerDocument || document;
    return doc?.scrollingElement || doc?.documentElement || document.scrollingElement || document.documentElement || null;
  }

  function setConversationScrollTop(container, top) {
    if (!container || !Number.isFinite(Number(top))) return false;
    const target = Math.max(0, Number(top));
    let applied = false;
    try {
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: target, left: Number(container.scrollLeft || 0), behavior: "auto" });
        applied = true;
      }
    } catch {}
    try {
      if (Math.abs(Number(container.scrollTop || 0) - target) > 1 || !applied) {
        container.scrollTop = target;
      }
      applied = true;
    } catch {}
    const actual = Number(container.scrollTop);
    return applied && Number.isFinite(actual) && Math.abs(actual - target) <= 3;
  }

  function waitForHydrationPoll(delayMs) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
  }

  function hydrationAppRuntimeReadiness(node, expectedRichBlockCount) {
    const blocks = nodesIncludingRoot(node, '[data-app-block-preview="true"]');
    if (!expectedRichBlockCount || blocks.length !== expectedRichBlockCount) {
      return {
        status: "conflict",
        reason: "Visualize app block count changed before hydration"
      };
    }
    for (const block of blocks) {
      const iframes = Array.from(block.querySelectorAll?.("iframe") || []);
      if (iframes.length === 0) return { status: "missing" };
      if (iframes.length !== 1) {
        return {
          status: "conflict",
          reason: "Visualize app runtime iframe is duplicated before hydration"
        };
      }
      const iframeUrl = String(iframes[0].getAttribute?.("src") || "").trim();
      if (!iframeUrl) return { status: "missing" };
      if (!isStrictRichAppRuntimeIframeUrl(iframeUrl)) {
        return {
          status: "conflict",
          reason: "Visualize app runtime iframe URL is not allowed before hydration"
        };
      }
    }
    return {
      status: "found",
      structureFingerprint: stableTurnFingerprint(JSON.stringify(hydrationRichAppStructure(node)))
    };
  }

  async function waitForStableHydrationClickWindow({
    root,
    a1Node,
    q2Node,
    a2Node,
    clickWindowProof,
    scrollContainer,
    resolveCurrentScrollContainer,
    routeKey,
    expectedRichBlockCount,
    timeoutMs,
    pollMs,
    runtimeGuard,
    nowFn = Date.now,
    waitForHydrationPollFn = waitForHydrationPoll
  }) {
    const deadline = nowFn() + Math.max(40, Number(timeoutMs) || 0);
    let stableKey = "";
    let readyRuntimeStructureFingerprint = "";
    while (nowFn() <= deadline) {
      if (conversationRouteKey() !== routeKey) {
        return { status: "conflict", reason: "conversation route changed before Visualize hydration" };
      }
      if (runtimeGuard?.isAborted?.()) {
        return { status: "conflict", reason: "extension runtime changed before Visualize hydration" };
      }
      if (scrollContainer?.isConnected === false) {
        return { status: "conflict", reason: "conversation scroll container changed before Visualize hydration" };
      }
      const entries = getVerifiedConversationTurnEntries(root);
      const a1Matches = a1Node ? entries.filter(entry => entry.node === a1Node) : [];
      const q2Matches = entries.filter(entry => entry.node === q2Node);
      const a2Matches = entries.filter(entry => entry.node === a2Node);
      if ((a1Node && a1Matches.length !== 1) || q2Matches.length !== 1 || a2Matches.length !== 1 ||
          (a1Node && (a1Matches[0].ambiguous || a1Matches[0].role !== "assistant")) ||
          q2Matches[0].ambiguous || q2Matches[0].role !== "user" ||
          a2Matches[0].ambiguous || a2Matches[0].role !== "assistant") {
        return { status: "conflict", reason: "Visualize click window changed before hydration" };
      }
      if (typeof resolveCurrentScrollContainer === "function" &&
          resolveCurrentScrollContainer(a2Matches[0]) !== scrollContainer) {
        return { status: "conflict", reason: "conversation scroll container changed before Visualize hydration" };
      }
      const q2Index = entries.indexOf(q2Matches[0]);
      const a2Index = entries.indexOf(a2Matches[0]);
      if (!(q2Index < a2Index) || entries.slice(q2Index + 1, a2Index)
        .some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant") ||
        !isExplicitVisualizeRequestNode(q2Node) ||
        !isPreviousAnswerVisualizationRequestText(visualizeRequestNodeToPlainText(q2Node)) ||
        !isVisualizeRequestForAssistant(q2Node, a2Node)) {
        return { status: "conflict", reason: "Visualize Q2/A2 binding changed before hydration" };
      }
      const roleBearingEntry = entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant";
      const a1Index = a1Node ? entries.indexOf(a1Matches[0]) : -1;
      const topologyChanged = a1Node
        ? !(a1Index < q2Index) || entries.slice(a1Index + 1, q2Index).some(roleBearingEntry)
        : entries.slice(0, q2Index).some(roleBearingEntry);
      const proofIdentityKeys = [
        clickWindowProof?.a1?.key,
        clickWindowProof?.q2?.key,
        clickWindowProof?.a2?.key
      ].filter(Boolean);
      const duplicateProofIdentity = proofIdentityKeys.some(key =>
        entries.filter(entry => verifiedTurnIdentity(entry) === key).length > 1
      );
      if (topologyChanged || duplicateProofIdentity) {
        return { status: "conflict", reason: "Visualize click window topology changed before hydration" };
      }
      const currentA2Proof = hydrationTurnProof(a2Matches[0]);
      const currentA2Shape = hydrationRichAppBlockShape(currentA2Proof?.richAppStructure || []);
      if (!clickWindowProof?.q2 || !clickWindowProof?.a2 ||
          verifiedTurnIdentity(q2Matches[0]) !== clickWindowProof.q2.key ||
          hydrationTurnFingerprint(q2Matches[0]) !== clickWindowProof.q2.fingerprint ||
          verifiedTurnIdentity(a2Matches[0]) !== clickWindowProof.a2.key ||
          hydrationTurnCoreFingerprintFromProof(currentA2Proof) !== clickWindowProof.a2.coreFingerprint ||
          JSON.stringify(currentA2Shape) !== JSON.stringify(clickWindowProof.a2.richAppBlockShape) ||
          (a1Node && (
            !clickWindowProof.a1 ||
            verifiedTurnIdentity(a1Matches[0]) !== clickWindowProof.a1.key ||
            hydrationTurnFingerprint(a1Matches[0]) !== clickWindowProof.a1.fingerprint
          ))) {
        return { status: "conflict", reason: "Visualize click window proof changed before hydration" };
      }
      const readiness = hydrationAppRuntimeReadiness(a2Node, expectedRichBlockCount);
      if (readiness.status === "conflict") return readiness;
      if (readiness.status === "found") {
        if (readyRuntimeStructureFingerprint &&
            readyRuntimeStructureFingerprint !== readiness.structureFingerprint) {
          return { status: "conflict", reason: "Visualize app runtime changed while becoming ready" };
        }
        if (!readyRuntimeStructureFingerprint) {
          readyRuntimeStructureFingerprint = readiness.structureFingerprint;
        }
        const currentKey = [
          readiness.structureFingerprint,
          Number(scrollContainer.scrollTop || 0),
          Number(scrollContainer.scrollHeight || 0),
          Number(scrollContainer.clientHeight || 0)
        ].join(":");
        if (currentKey === stableKey) {
          return {
            status: "found",
            entries,
            a1: a1Matches[0] || null,
            q2: q2Matches[0],
            a2: a2Matches[0]
          };
        }
        stableKey = currentKey;
      } else {
        if (readyRuntimeStructureFingerprint) {
          return { status: "conflict", reason: "Visualize app runtime changed while becoming ready" };
        }
        stableKey = "";
      }
      if (nowFn() >= deadline) break;
      await waitForHydrationPollFn(pollMs);
    }
    return {
      status: "missing",
      reason: "Visualize app runtime did not become stable before hydration"
    };
  }

  function mountedPreviousQuestionForAnchor(entries, a1Snapshot, frozenSnapshots = []) {
    const a1Match = findHydrationTurn(entries, a1Snapshot);
    if (a1Match.status !== "found") return a1Match;
    const a1Index = entries.indexOf(a1Match.entry);
    const q1 = [...entries.slice(0, a1Index)].reverse()
      .find(entry => !entry.ambiguous && entry.role === "user");
    if (!q1) return { status: "missing" };
    const q1Index = entries.indexOf(q1);
    const between = entries.slice(q1Index + 1, a1Index);
    if (between.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return { status: "conflict", reason: "virtualized Q1/A1 correspondence is ambiguous" };
    }
    const q1Snapshot = captureHydrationTurn(q1);
    const frozenKeys = new Set(
      [a1Snapshot, ...frozenSnapshots]
        .map(snapshot => String(snapshot?.key || ""))
        .filter(Boolean)
    );
    if (q1Snapshot?.key && frozenKeys.has(q1Snapshot.key)) {
      return { status: "conflict", reason: "virtualized Q1 reuses a frozen turn identity" };
    }
    const q1IdentityMatches = q1Snapshot
      ? entries.filter(entry => verifiedTurnIdentity(entry) === q1Snapshot.key)
      : [];
    if (q1IdentityMatches.length !== 1) {
      return { status: "conflict", reason: "virtualized Q1 has duplicate or missing identity" };
    }
    const questionText = questionNodeToPlainText(q1.node);
    if (!q1Snapshot || !questionText) {
      return { status: "conflict", reason: "virtualized Q1 could not be verified" };
    }
    return { status: "found", q1Snapshot, questionText };
  }

  function mountedPreviousAnswerForRequestAnchor(entries, q2Snapshot, frozenSnapshots = []) {
    const q2Match = findHydrationTurn(entries, q2Snapshot);
    if (q2Match.status !== "found") return q2Match;
    const q2Index = entries.indexOf(q2Match.entry);
    const predecessor = [...entries.slice(0, q2Index)].reverse()
      .find(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant");
    if (!predecessor) return { status: "missing" };
    if (predecessor.ambiguous || predecessor.role !== "assistant") {
      return { status: "conflict", reason: "virtualized A1/Q2 correspondence is ambiguous" };
    }
    const a1Index = entries.indexOf(predecessor);
    const between = entries.slice(a1Index + 1, q2Index);
    if (between.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return { status: "conflict", reason: "virtualized A1/Q2 correspondence is ambiguous" };
    }
    const a1Snapshot = captureHydrationTurn(predecessor);
    const frozenKeys = new Set(
      [q2Snapshot, ...frozenSnapshots]
        .map(snapshot => String(snapshot?.key || ""))
        .filter(Boolean)
    );
    if (a1Snapshot?.key && frozenKeys.has(a1Snapshot.key)) {
      return { status: "conflict", reason: "virtualized A1 reuses a frozen turn identity" };
    }
    const a1IdentityMatches = a1Snapshot
      ? entries.filter(entry => verifiedTurnIdentity(entry) === a1Snapshot.key)
      : [];
    if (a1IdentityMatches.length !== 1) {
      return { status: "conflict", reason: "virtualized A1 has duplicate or missing identity" };
    }

    let answerNode = null;
    try {
      answerNode = predecessor.node.cloneNode?.(true) || null;
    } catch {}
    if (!a1Snapshot || !answerNode || answerNode === predecessor.node) {
      return { status: "conflict", reason: "virtualized A1 could not be frozen independently" };
    }
    const answerEntry = { role: "assistant", node: answerNode, ambiguous: false };
    const answerFingerprint = hydrationTurnFingerprint(answerEntry);
    const answerText = hydrationTurnText(answerEntry);
    if (!answerFingerprint || answerFingerprint !== a1Snapshot.fingerprint || !answerText) {
      return { status: "conflict", reason: "virtualized A1 frozen payload does not match its turn proof" };
    }
    return { status: "found", a1Snapshot, answerNode, answerText, answerFingerprint };
  }

  function validateRestoredVisualizeWindow(
    entries,
    anchors,
    expectedRichBlockCount,
    { requireA1 = true, a2ShareTransition = null } = {}
  ) {
    const a1Match = anchors?.a1
      ? findHydrationTurn(entries, anchors.a1)
      : { status: "missing" };
    const q2Match = findHydrationTurn(entries, anchors.q2);
    const a2Match = a2ShareTransition
      ? findHydrationA2DuringVerifiedShare(entries, anchors.a2, a2ShareTransition)
      : findHydrationTurn(entries, anchors.a2);
    const matches = [a1Match, q2Match, a2Match];
    const conflict = matches.find(match => match.status === "conflict");
    if (conflict) return conflict;
    if (q2Match.status !== "found" || a2Match.status !== "found" ||
        (requireA1 && a1Match.status !== "found")) {
      return { status: "missing" };
    }

    const q2Index = entries.indexOf(q2Match.entry);
    const a2Index = entries.indexOf(a2Match.entry);
    if (!(q2Index < a2Index)) {
      return { status: "conflict", reason: "restored Visualize turn order changed" };
    }
    const betweenQ2AndA2 = entries.slice(q2Index + 1, a2Index);
    if (betweenQ2AndA2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return { status: "conflict", reason: "restored Visualize turn correspondence is ambiguous" };
    }
    if (a1Match.status === "found") {
      const a1Index = entries.indexOf(a1Match.entry);
      const betweenA1AndQ2 = entries.slice(a1Index + 1, q2Index);
      if (!(a1Index < q2Index) || betweenA1AndQ2
        .some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
        return { status: "conflict", reason: "restored Visualize turn correspondence is ambiguous" };
      }
    } else if (entries.slice(0, q2Index)
      .some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return { status: "conflict", reason: "restored Visualize predecessor could not be verified" };
    }

    const requestText = visualizeRequestNodeToPlainText(q2Match.entry.node);
    if (!isExplicitVisualizeRequestNode(q2Match.entry.node) ||
        !isPreviousAnswerVisualizationRequestText(requestText) ||
        !isVisualizeRequestForAssistant(q2Match.entry.node, a2Match.entry.node)) {
      return { status: "conflict", reason: "restored Visualize request marker changed" };
    }
    if (collectRichAppBlockCandidates(a2Match.entry.node).length !== expectedRichBlockCount) {
      return { status: "conflict", reason: "restored Visualize app evidence changed" };
    }
    return {
      status: "found",
      a1: a1Match.status === "found" ? a1Match.entry : null,
      q2: q2Match.entry,
      a2: a2Match.entry,
      requestText,
      a2ShareRelocationVerified: a2Match.shareRelocationVerified === true
    };
  }

  function revalidateHydratedVisualizeContext(
    currentAssistantNode,
    visualizeContext,
    { root = document, a2ShareTransition = null } = {}
  ) {
    if (!visualizeContext?.hydratedFromVirtualizedTurns) return { ok: true };
    const proof = visualizeContext.hydrationVerification || null;
    if (!proof?.routeKey || !proof?.anchors) {
      return { ok: false, reason: "hydrated Visualize verification evidence is missing" };
    }
    const proofSnapshots = [
      proof.anchors.q1,
      proof.anchors.a1,
      proof.anchors.q2,
      proof.anchors.a2
    ];
    const proofRoles = ["user", "assistant", "user", "assistant"];
    if (proofSnapshots.some((snapshot, index) => !snapshot?.key || snapshot.role !== proofRoles[index]) ||
        new Set(proofSnapshots.map(snapshot => snapshot.key)).size !== proofSnapshots.length) {
      return { ok: false, reason: "hydrated Visualize chronology proof is invalid" };
    }
    if (!proof.questionTextFingerprint || !proof.answerTextFingerprint) {
      return { ok: false, reason: "hydrated Visualize payload proof is missing" };
    }
    if (proof.requireA1AtRestoredWindow === false &&
        (!proof.answerNodeFingerprint || proof.answerNodeFingerprint !== proof.anchors.a1.fingerprint)) {
      return { ok: false, reason: "hydrated Visualize frozen A1 proof is inconsistent" };
    }
    if (conversationRouteKey() !== proof.routeKey) {
      return { ok: false, reason: "conversation route changed after Visualize hydration" };
    }
    if (proof.questionTextFingerprint &&
        stableTurnFingerprint(visualizeContext.questionText) !== proof.questionTextFingerprint) {
      return { ok: false, reason: "hydrated Visualize Q1 payload changed before Share" };
    }
    if (proof.answerTextFingerprint &&
        stableTurnFingerprint(visualizeContext.answerText) !== proof.answerTextFingerprint) {
      return { ok: false, reason: "hydrated Visualize A1 payload changed before Share" };
    }
    if (proof.answerNodeFingerprint) {
      const answerNodeFingerprint = hydrationTurnFingerprint({
        role: "assistant",
        node: visualizeContext.answerNode,
        ambiguous: false
      });
      if (!answerNodeFingerprint || answerNodeFingerprint !== proof.answerNodeFingerprint) {
        return { ok: false, reason: "hydrated Visualize frozen A1 payload changed before Share" };
      }
    }
    const currentEntries = getVerifiedConversationTurnEntries(root);
    const hydrationRecovery = visualizeContext.hydrationRecovery || null;
    if (typeof hydrationRecovery?.resolveCurrentScrollContainer === "function") {
      const exactCurrentA2Entries = currentEntries.filter(entry => entry.node === currentAssistantNode);
      if (exactCurrentA2Entries.length === 1 &&
          hydrationRecovery.resolveCurrentScrollContainer(exactCurrentA2Entries[0]) !== hydrationRecovery.scrollContainer) {
        return { ok: false, reason: "conversation scroll container changed after Visualize hydration" };
      }
    }
    const verified = validateRestoredVisualizeWindow(
      currentEntries,
      proof.anchors,
      proof.expectedRichBlockCount,
      {
        requireA1: proof.requireA1AtRestoredWindow !== false,
        a2ShareTransition
      }
    );
    if (verified.status !== "found") {
      let retryableMissingQ2 = false;
      let retryableMissingHydrationWindow = false;
      if (verified.status === "missing" && !a2ShareTransition) {
        const requireA1 = proof.requireA1AtRestoredWindow !== false;
        const a1Match = findHydrationTurn(currentEntries, proof.anchors.a1);
        const q2Match = findHydrationTurn(currentEntries, proof.anchors.q2);
        const a2Match = findHydrationTurn(currentEntries, proof.anchors.a2);
        const a2Index = a2Match.status === "found" ? currentEntries.indexOf(a2Match.entry) : -1;
        const a1Index = a1Match.status === "found" ? currentEntries.indexOf(a1Match.entry) : -1;
        const q2Index = q2Match.status === "found" ? currentEntries.indexOf(q2Match.entry) : -1;
        const roleBearingEntry = entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant";
        const actualPredecessors = a2Index >= 0
          ? currentEntries.slice(0, a2Index).filter(roleBearingEntry)
          : [];
        const expectedPredecessors = [
          a1Match.status === "found" ? a1Match.entry : null,
          q2Match.status === "found" ? q2Match.entry : null
        ].filter(Boolean);
        const predecessorWindowExact = actualPredecessors.length === expectedPredecessors.length &&
          actualPredecessors.every((entry, index) => entry === expectedPredecessors[index]);
        const foundOrderValid = (a1Index < 0 || a1Index < a2Index) &&
          (q2Index < 0 || q2Index < a2Index) &&
          (a1Index < 0 || q2Index < 0 || a1Index < q2Index);
        const foundQ2BindingValid = q2Match.status !== "found" || (
          isExplicitVisualizeRequestNode(q2Match.entry.node) &&
          isPreviousAnswerVisualizationRequestText(visualizeRequestNodeToPlainText(q2Match.entry.node)) &&
          isVisualizeRequestForAssistant(q2Match.entry.node, a2Match.entry?.node)
        );
        const requiredAnchorMissing = q2Match.status === "missing" ||
          (requireA1 && a1Match.status === "missing");
        retryableMissingHydrationWindow = requiredAnchorMissing &&
          a2Match.status === "found" &&
          a2Match.entry.node === visualizeContext.visualizeAnswerNode &&
          a2Match.entry.node === currentAssistantNode &&
          a2Index >= 0 &&
          predecessorWindowExact &&
          foundOrderValid &&
          foundQ2BindingValid;
        retryableMissingQ2 = retryableMissingHydrationWindow &&
          proof.requireA1AtRestoredWindow === false &&
          q2Match.status === "missing";
      }
      return {
        ok: false,
        retryableMissingQ2,
        retryableMissingHydrationWindow,
        reason: verified.reason || "hydrated Visualize turn context changed before Share"
      };
    }
    if (verified.a2.node !== visualizeContext.visualizeAnswerNode ||
        verified.a2.node !== currentAssistantNode) {
      return { ok: false, reason: "hydrated Visualize turn nodes remounted before Share" };
    }
    if (verified.q2.node !== visualizeContext.visualizeRequestNode) {
      return {
        ok: false,
        verifiedHydrationRemount: true,
        reason: "hydrated Visualize Q2 remounted before Share"
      };
    }
    if (proof.requireA1AtRestoredWindow !== false && verified.a1?.node !== visualizeContext.answerNode) {
      return {
        ok: false,
        verifiedHydrationRemount: true,
        reason: "hydrated Visualize A1 remounted before Share"
      };
    }
    return {
      ok: true,
      a2ShareRelocationVerified: verified.a2ShareRelocationVerified === true
    };
  }

  async function restoreVisualizeHydrationWindow({
    root,
    scrollContainer,
    scrollSnapshot,
    routeKey,
    anchors,
    expectedRichBlockCount,
    requireA1AtRestoredWindow = true,
    expectedPinnedA2Node = null,
    resolveCurrentScrollContainer = null,
    followingNavigationAnchor = null,
    maxFollowingAnchorCorrectionPx = 0,
    restoreProbeStepPx,
    timeoutMs,
    pollMs,
    runtimeGuard,
    nowFn = Date.now,
    waitForHydrationPollFn = waitForHydrationPoll
  }) {
    if (conversationRouteKey() !== routeKey) {
      return { status: "conflict", reason: "conversation route changed during Visualize hydration" };
    }
    const runtimeAbortedBeforeRestore = runtimeGuard?.isAborted?.() === true;
    const startedAt = nowFn();
    const deadline = startedAt + Math.max(40, Number(timeoutMs) || 0);
    let bottomOffsetApplied = false;
    let expectedScrollTop = scrollSnapshot.scrollTop;
    let restoreProbeAttempted = false;
    let restoreProbeActive = false;
    let sawRestoredTarget = false;
    let settledGeometryKey = "";
    let settledProbeGeometryKey = "";
    const findFollowingNavigationAnchor = entries => {
      if (!followingNavigationAnchor) return { status: "missing" };
      const frozenKey = followingNavigationAnchor.snapshot?.key;
      const primaryIdentityMatches = entries.filter(entry => verifiedTurnIdentity(entry) === frozenKey);
      const containerIdentityMatches = entries.filter(entry => verifiedTurnContainerIdentity(entry) === frozenKey);
      if (!containerIdentityMatches.length) {
        if (!primaryIdentityMatches.length) return { status: "missing" };
        return {
          status: "conflict",
          reason: "following Visualize turn navigation anchor changed during hydration"
        };
      }
      if (containerIdentityMatches.length !== 1 || primaryIdentityMatches.length !== 1 ||
          primaryIdentityMatches[0] !== containerIdentityMatches[0]) {
        return {
          status: "conflict",
          reason: "following Visualize turn navigation anchor changed during hydration"
        };
      }
      const entry = containerIdentityMatches[0];
      if (entry.ambiguous || entry.role !== followingNavigationAnchor.snapshot.role ||
          hydrationTurnFingerprint(entry) !== followingNavigationAnchor.snapshot.fingerprint) {
        return {
          status: "conflict",
          reason: "following Visualize turn navigation anchor changed during hydration"
        };
      }
      return { status: "found", entry };
    };
    const validatePinnedRecoveryBoundary = entries => {
      if (!expectedPinnedA2Node && !followingNavigationAnchor &&
          typeof resolveCurrentScrollContainer !== "function") return null;
      const exactA2Entries = expectedPinnedA2Node
        ? entries.filter(entry => entry.node === expectedPinnedA2Node)
        : [];
      if (expectedPinnedA2Node && exactA2Entries.length !== 1) {
        return { status: "conflict", reason: "hydrated Visualize A2 changed during recovery" };
      }
      const navigationMatch = findFollowingNavigationAnchor(entries);
      if (navigationMatch.status === "conflict") return navigationMatch;
      if (typeof resolveCurrentScrollContainer === "function") {
        let currentScrollContainer = null;
        try {
          const referenceEntry = exactA2Entries[0] ||
            (navigationMatch.status === "found" ? navigationMatch.entry : null) ||
            entries.find(entry => !entry.ambiguous && (entry.role === "user" || entry.role === "assistant")) ||
            null;
          currentScrollContainer = resolveCurrentScrollContainer(referenceEntry);
        } catch {}
        if (currentScrollContainer !== scrollContainer) {
          return { status: "conflict", reason: "conversation scroll container changed during Visualize hydration" };
        }
      }
      return null;
    };
    const followingAnchorCorrection = entries => {
      if (!followingNavigationAnchor) return { status: "missing" };
      const match = findFollowingNavigationAnchor(entries);
      if (match.status === "missing") return match;
      if (match.status === "conflict") return match;
      let currentTurnTop = NaN;
      let currentScrollerTop = NaN;
      try {
        currentTurnTop = Number(match.entry.turn?.getBoundingClientRect?.().top);
        currentScrollerTop = Number(scrollContainer.getBoundingClientRect?.().top);
      } catch {}
      const currentRelativeTop = currentTurnTop - currentScrollerTop;
      const frozenRelativeTop = Number(followingNavigationAnchor.relativeTop);
      const currentScrollTop = Number(scrollContainer.scrollTop || 0);
      const correctedScrollTop = currentScrollTop + currentRelativeTop - frozenRelativeTop;
      const correctionDistance = currentScrollTop - correctedScrollTop;
      const correctionLimit = Math.max(1, Number(maxFollowingAnchorCorrectionPx) || 0);
      if (!Number.isFinite(currentRelativeTop) || !Number.isFinite(frozenRelativeTop) ||
          !Number.isFinite(correctedScrollTop) || correctedScrollTop < 0 ||
          !Number.isFinite(correctionDistance)) {
        return {
          status: "conflict",
          reason: "following Visualize turn navigation geometry could not be safely restored"
        };
      }
      if (Math.abs(correctionDistance) <= 1) return { status: "aligned" };
      if (correctionDistance < 0 || correctionDistance > correctionLimit) {
        return {
          status: "conflict",
          reason: "following Visualize turn navigation geometry could not be safely restored"
        };
      }
      return { status: "found", correctedScrollTop };
    };
    const currentBottomOffsetTop = () => Math.max(0,
      Number(scrollContainer.scrollHeight || 0) -
      Number(scrollContainer.clientHeight || 0) -
      scrollSnapshot.bottomOffset
    );
    const restoreLogicalPosition = () => {
      const logicalTop = bottomOffsetApplied
        ? currentBottomOffsetTop()
        : scrollSnapshot.scrollTop;
      if (!Number.isFinite(logicalTop) || !setConversationScrollTop(scrollContainer, logicalTop)) return false;
      expectedScrollTop = logicalTop;
      restoreProbeActive = false;
      settledGeometryKey = "";
      settledProbeGeometryKey = "";
      return true;
    };
    const applyBottomOffset = () => {
      const bottomTop = currentBottomOffsetTop();
      if (!Number.isFinite(bottomTop) || !setConversationScrollTop(scrollContainer, bottomTop)) return false;
      expectedScrollTop = bottomTop;
      bottomOffsetApplied = true;
      restoreProbeActive = false;
      settledGeometryKey = "";
      settledProbeGeometryKey = "";
      return true;
    };
    if (scrollContainer?.isConnected === false) {
      return { status: "conflict", reason: "conversation scroll container changed during Visualize hydration" };
    }
    const initialEntries = getVerifiedConversationTurnEntries(root);
    const initialPinnedBoundary = validatePinnedRecoveryBoundary(initialEntries);
    if (initialPinnedBoundary) return initialPinnedBoundary;
    if (!setConversationScrollTop(scrollContainer, scrollSnapshot.scrollTop) && !applyBottomOffset()) {
      return { status: "conflict", reason: "conversation scroll position could not be restored" };
    }
    // Even a stale content-script generation must undo the local scroll it
    // initiated on the same route. Stop immediately after that cleanup; no
    // runtime-dependent work or external boundary may continue.
    if (runtimeAbortedBeforeRestore) {
      return { status: "conflict", reason: "extension runtime changed during Visualize hydration" };
    }
    while (nowFn() <= deadline) {
      if (conversationRouteKey() !== routeKey) {
        return { status: "conflict", reason: "conversation route changed during Visualize hydration" };
      }
      if (scrollContainer?.isConnected === false) {
        return { status: "conflict", reason: "conversation scroll container changed during Visualize hydration" };
      }
      const entries = getVerifiedConversationTurnEntries(root);
      const pinnedBoundary = validatePinnedRecoveryBoundary(entries);
      if (pinnedBoundary) return pinnedBoundary;
      if (runtimeGuard?.isAborted?.()) {
        if (restoreProbeActive) restoreLogicalPosition();
        return { status: "conflict", reason: "extension runtime changed during Visualize hydration" };
      }
      if (bottomOffsetApplied && !restoreProbeActive) {
        const currentBottomTop = currentBottomOffsetTop();
        if (!Number.isFinite(currentBottomTop)) {
          return { status: "conflict", reason: "conversation scroll position could not be restored" };
        }
        if (Math.abs(currentBottomTop - expectedScrollTop) > 3 && !applyBottomOffset()) {
          return { status: "conflict", reason: "conversation scroll position could not be restored" };
        }
      }
      const restored = validateRestoredVisualizeWindow(
        entries,
        anchors,
        expectedRichBlockCount,
        { requireA1: requireA1AtRestoredWindow }
      );
      const atExpectedTop = Math.abs(Number(scrollContainer.scrollTop || 0) - expectedScrollTop) <= 3;
      if (restored.status === "found") {
        sawRestoredTarget = true;
        if (!atExpectedTop) {
          if (restoreProbeActive) {
            const probeGeometryKey = [
              Number(scrollContainer.scrollTop || 0),
              Number(scrollContainer.scrollHeight || 0),
              Number(scrollContainer.clientHeight || 0)
            ].join(":");
            if (settledProbeGeometryKey === probeGeometryKey) {
              if (!restoreLogicalPosition()) {
                return { status: "conflict", reason: "conversation scroll position could not be restored" };
              }
            } else {
              settledProbeGeometryKey = probeGeometryKey;
            }
          } else if (!restoreLogicalPosition()) {
            return { status: "conflict", reason: "conversation scroll position could not be restored" };
          }
        } else {
          const geometryKey = [
            Number(scrollContainer.scrollTop || 0),
            Number(scrollContainer.scrollHeight || 0),
            Number(scrollContainer.clientHeight || 0),
            expectedScrollTop
          ].join(":");
          if (settledGeometryKey === geometryKey) return restored;
          settledGeometryKey = geometryKey;
        }
      } else {
        settledGeometryKey = "";
        settledProbeGeometryKey = "";
      }
      if (restored.status === "conflict") {
        if (restoreProbeActive) restoreLogicalPosition();
        return restored;
      }

      const navigationAnchorAtAbsoluteRestore = !bottomOffsetApplied && restored.status === "missing"
        ? findFollowingNavigationAnchor(entries)
        : { status: "missing" };
      if (navigationAnchorAtAbsoluteRestore.status === "conflict") {
        return navigationAnchorAtAbsoluteRestore;
      }
      const blindProbeDelayElapsed = nowFn() - startedAt >= Math.max(20, (deadline - startedAt) / 2);
      if (!bottomOffsetApplied && (
        navigationAnchorAtAbsoluteRestore.status === "found" ||
        blindProbeDelayElapsed
      )) {
        if (!applyBottomOffset()) {
          return { status: "conflict", reason: "conversation scroll position could not be restored" };
        }
      } else if (bottomOffsetApplied && restored.status === "missing" && !restoreProbeAttempted) {
        const anchoredCorrection = followingAnchorCorrection(entries);
        if (anchoredCorrection.status === "conflict") return anchoredCorrection;
        if (anchoredCorrection.status === "found" ||
            (anchoredCorrection.status === "missing" && blindProbeDelayElapsed)) {
          restoreProbeAttempted = true;
          let probeTop = null;
          if (anchoredCorrection.status === "found") {
            probeTop = anchoredCorrection.correctedScrollTop;
          } else {
            const clientHeight = Math.max(1, Number(scrollContainer.clientHeight || 0));
            const requestedProbeStep = Math.max(1, Number(restoreProbeStepPx) || clientHeight * 0.85);
            const probeStep = Math.min(clientHeight, requestedProbeStep);
            probeTop = Math.max(0, Number(scrollContainer.scrollTop || 0) - probeStep);
          }
          const currentTop = Number(scrollContainer.scrollTop || 0);
          if (Number.isFinite(probeTop) && probeTop < currentTop &&
              setConversationScrollTop(scrollContainer, probeTop)) {
            restoreProbeActive = true;
            settledGeometryKey = "";
            settledProbeGeometryKey = "";
          }
        }
      }
      await waitForHydrationPollFn(pollMs);
    }
    if (conversationRouteKey() !== routeKey) {
      return { status: "conflict", reason: "conversation route changed during Visualize hydration" };
    }
    if (scrollContainer?.isConnected === false) {
      return { status: "conflict", reason: "conversation scroll container changed during Visualize hydration" };
    }
    const finalEntries = getVerifiedConversationTurnEntries(root);
    const finalPinnedBoundary = validatePinnedRecoveryBoundary(finalEntries);
    if (finalPinnedBoundary) return finalPinnedBoundary;
    if (restoreProbeActive && conversationRouteKey() === routeKey && !restoreLogicalPosition()) {
      return { status: "conflict", reason: "conversation scroll position could not be restored" };
    }
    if (sawRestoredTarget) {
      return { status: "missing", reason: "restored Visualize target did not settle at the original scroll position" };
    }
    return { status: "missing", reason: "restored Visualize target could not be reacquired" };
  }

  async function recoverHydratedVisualizeMissingQ2(
    currentAssistantNode,
    visualizeContext,
    {
      root = document,
      runtimeGuard = null,
      allowVerifiedHydrationRemount = false
    } = {}
  ) {
    const beforeRecovery = revalidateHydratedVisualizeContext(
      currentAssistantNode,
      visualizeContext,
      { root }
    );
    if (beforeRecovery.ok) return beforeRecovery;
    if (!beforeRecovery.retryableMissingHydrationWindow &&
        !beforeRecovery.retryableMissingQ2 &&
        !(allowVerifiedHydrationRemount && beforeRecovery.verifiedHydrationRemount === true)) {
      return beforeRecovery;
    }

    const recovery = visualizeContext?.hydrationRecovery || null;
    const proof = visualizeContext?.hydrationVerification || null;
    if (!recovery || recovery.attempted === true || !proof?.anchors) {
      return {
        ok: false,
        reason: recovery?.attempted === true
          ? "hydrated Visualize Q2 recovery was already attempted"
          : "hydrated Visualize Q2 recovery evidence is missing"
      };
    }
    // Spend the only recovery before awaiting. A route/runtime/layout race may
    // never fan out into repeated scrolls or repeated external boundaries.
    recovery.attempted = true;
    if (conversationRouteKey() !== proof.routeKey) {
      return { ok: false, reason: "conversation route changed before hydrated Visualize Q2 recovery" };
    }
    if (runtimeGuard?.isAborted?.()) {
      return { ok: false, reason: "extension runtime changed before hydrated Visualize Q2 recovery" };
    }
    if (recovery.scrollContainer?.isConnected === false) {
      return { ok: false, reason: "conversation scroll container changed before hydrated Visualize Q2 recovery" };
    }

    const restored = await restoreVisualizeHydrationWindow({
      root: recovery.root || root,
      scrollContainer: recovery.scrollContainer,
      scrollSnapshot: recovery.scrollSnapshot,
      routeKey: proof.routeKey,
      anchors: proof.anchors,
      expectedRichBlockCount: proof.expectedRichBlockCount,
      requireA1AtRestoredWindow: proof.requireA1AtRestoredWindow !== false,
      expectedPinnedA2Node: currentAssistantNode,
      resolveCurrentScrollContainer: recovery.resolveCurrentScrollContainer,
      restoreProbeStepPx: recovery.restoreProbeStepPx,
      timeoutMs: recovery.timeoutMs,
      pollMs: recovery.pollMs,
      runtimeGuard,
      nowFn: recovery.nowFn,
      waitForHydrationPollFn: recovery.waitForHydrationPollFn
    });
    if (restored?.status !== "found") {
      return {
        ok: false,
        reason: restored?.reason || "hydrated Visualize Q2 could not be reacquired"
      };
    }
    if (restored.a2?.node !== currentAssistantNode ||
        restored.a2?.node !== visualizeContext.visualizeAnswerNode) {
      return { ok: false, reason: "hydrated Visualize A2 changed during Q2 recovery" };
    }

    visualizeContext.visualizeRequestNode = restored.q2.node;
    if (proof.requireA1AtRestoredWindow !== false) {
      if (!restored.a1?.node) {
        return { ok: false, reason: "hydrated Visualize A1 was not reacquired" };
      }
      visualizeContext.answerNode = restored.a1.node;
    }
    const strictStatus = revalidateHydratedVisualizeContext(
      currentAssistantNode,
      visualizeContext,
      { root: recovery.root || root }
    );
    if (!strictStatus.ok) {
      return {
        ok: false,
        reason: strictStatus.reason || "hydrated Visualize Q2 recovery proof failed"
      };
    }
    return {
      ...strictStatus,
      recoveredHydrationWindow: true,
      recoveredQ2: true
    };
  }

  async function resolveVisualizeSaveContextWithHydration(currentAssistantNode, options = {}) {
    let synchronous;
    try {
      synchronous = resolveVisualizeSaveContext(currentAssistantNode);
    } catch (error) {
      return { mode: "unresolved", reason: error?.message || "Visualize context resolution failed" };
    }
    const missingQ1BeforeA1 = synchronous?.code === "missing-q1-before-a1" ||
      synchronous?.reason === "Q1 could not be resolved before A1";
    const missingA1BeforeQ2 = synchronous?.code === "missing-a1-before-q2";
    if (synchronous?.mode !== "unresolved" || (!missingQ1BeforeA1 && !missingA1BeforeQ2)) {
      return synchronous;
    }

    const root = options.root?.querySelectorAll ? options.root : document;
    const entries = getVerifiedConversationTurnEntries(root);
    const currentTurn = currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || null;
    const a2Index = entries.findIndex(entry => entry.turn === currentTurn);
    if (a2Index < 0) return synchronous;
    const q2 = [...entries.slice(0, a2Index)].reverse()
      .find(entry => !entry.ambiguous && entry.role === "user");
    if (!q2) return synchronous;
    const q2Index = entries.indexOf(q2);
    const initialA1 = [...entries.slice(0, q2Index)].reverse()
      .find(entry => !entry.ambiguous && entry.role === "assistant");
    const requestText = visualizeRequestNodeToPlainText(q2.node);
    if (!isExplicitVisualizeRequestNode(q2.node) ||
        !isPreviousAnswerVisualizationRequestText(requestText)) {
      return synchronous;
    }
    if (missingQ1BeforeA1 && !initialA1) return synchronous;
    if (missingA1BeforeQ2 && entries.slice(0, q2Index)
      .some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return synchronous;
    }

    const requireA1AtRestoredWindow = !missingA1BeforeQ2;
    const routeKey = conversationRouteKey();
    const scrollContainer = options.scrollContainer || resolveConversationScrollContainer(currentTurn, { root });
    if (!routeKey || !scrollContainer || !Number.isFinite(Number(scrollContainer?.scrollTop))) {
      return { mode: "unresolved", reason: "Visualize conversation scroll context could not be resolved" };
    }
    const expectedRichBlockCount = collectRichAppBlockCandidates(currentAssistantNode).length;
    const clickQ2Snapshot = captureHydrationTurn(q2);
    const clickA1Snapshot = initialA1 ? captureHydrationTurn(initialA1) : null;
    const clickA2Proof = hydrationTurnProof(entries[a2Index]);
    const clickA2Key = verifiedTurnIdentity(entries[a2Index]);
    const clickWindowProof = {
      a1: clickA1Snapshot,
      q2: clickQ2Snapshot,
      a2: {
        key: clickA2Key,
        role: entries[a2Index]?.role || "",
        coreFingerprint: hydrationTurnCoreFingerprintFromProof(clickA2Proof),
        richAppBlockShape: hydrationRichAppBlockShape(clickA2Proof?.richAppStructure || [])
      }
    };
    const clickProofKeys = [clickA1Snapshot?.key, clickQ2Snapshot?.key, clickA2Key].filter(Boolean);
    if (!clickQ2Snapshot || !clickA2Key || !clickWindowProof.a2.coreFingerprint ||
        (initialA1 && !clickA1Snapshot) || new Set(clickProofKeys).size !== clickProofKeys.length) {
      return { mode: "unresolved", reason: "Visualize hydration requires unique stable turn identities" };
    }
    const maxScrollSteps = Math.max(1, Math.min(32, Number(options.maxScrollSteps) || 16));
    const scrollStepPx = Math.max(200, Number(options.scrollStepPx) || Math.max(600, Number(scrollContainer.clientHeight || 0) * 0.85));
    const timeoutMs = Math.max(40, Number(options.timeoutMs) || 8000);
    const pollMs = Math.max(1, Number(options.pollMs) || 60);
    const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;
    const waitForHydrationPollFn = typeof options.waitForHydrationPollFn === "function"
      ? options.waitForHydrationPollFn
      : waitForHydrationPoll;
    const restorationTimeoutMs = Math.max(80, Math.min(3000, timeoutMs));
    const appReadinessTimeoutMs = Math.max(
      40,
      Math.min(3000, Number(options.appReadinessTimeoutMs) || timeoutMs)
    );
    const readyClickWindow = await waitForStableHydrationClickWindow({
      root,
      a1Node: initialA1?.node || null,
      q2Node: q2.node,
      a2Node: currentAssistantNode,
      clickWindowProof,
      scrollContainer,
      resolveCurrentScrollContainer: options.scrollContainer
        ? null
        : entry => resolveConversationScrollContainer(entry?.turn, { root }),
      routeKey,
      expectedRichBlockCount,
      timeoutMs: appReadinessTimeoutMs,
      pollMs,
      runtimeGuard: options.runtimeGuard,
      nowFn,
      waitForHydrationPollFn
    });
    if (readyClickWindow.status !== "found") {
      return {
        mode: "unresolved",
        reason: readyClickWindow.reason || "Visualize app runtime was not ready before hydration"
      };
    }
    let a1Snapshot = clickA1Snapshot;
    const q2Snapshot = clickQ2Snapshot;
    const a2Snapshot = captureHydrationTurn(readyClickWindow.a2);
    const initialSnapshots = [a1Snapshot, q2Snapshot, a2Snapshot].filter(Boolean);
    if (!q2Snapshot || !a2Snapshot || (initialA1 && !a1Snapshot) ||
        new Set(initialSnapshots.map(snapshot => snapshot.key)).size !== initialSnapshots.length) {
      return { mode: "unresolved", reason: "Visualize hydration requires unique stable turn identities" };
    }
    const originalScrollTop = Number(scrollContainer.scrollTop);
    const scrollSnapshot = {
      scrollTop: originalScrollTop,
      scrollLeft: Number(scrollContainer.scrollLeft || 0),
      bottomOffset: Math.max(0,
        Number(scrollContainer.scrollHeight || 0) -
        Number(scrollContainer.clientHeight || 0) -
        originalScrollTop
      )
    };
    const followingNavigationAnchor = captureFollowingHydrationNavigationAnchor(
      readyClickWindow.entries,
      readyClickWindow.a2,
      scrollContainer
    );
    const maxFollowingAnchorCorrectionPx = maxScrollSteps * scrollStepPx;
    const deadline = nowFn() + timeoutMs;
    let recoveredQuestion = null;
    let recoveredAnswer = null;
    let failureReason = "Q1 could not be recovered from verified virtualized turn overlap";
    let hydrationConflict = false;
    let restored = null;

    try {
      for (let step = 0; step < maxScrollSteps && nowFn() <= deadline; step += 1) {
        if (conversationRouteKey() !== routeKey) {
          failureReason = "conversation route changed during Visualize hydration";
          break;
        }
        if (options.runtimeGuard?.isAborted?.()) {
          failureReason = "extension runtime changed during Visualize hydration";
          break;
        }
        const beforeTop = Number(scrollContainer.scrollTop || 0);
        const nextTop = Math.max(0, beforeTop - scrollStepPx);
        if (nextTop === beforeTop) break;
        if (!setConversationScrollTop(scrollContainer, nextTop)) {
          failureReason = "conversation scroll movement could not be applied";
          break;
        }

        const remainingMs = Math.max(0, deadline - nowFn());
        const remainingSteps = Math.max(1, maxScrollSteps - step);
        const stepWaitMs = Math.max(
          500,
          pollMs * 3,
          Number(options.stepWaitMs) || 0,
          Math.floor(remainingMs / remainingSteps)
        );
        const stepDeadline = Math.min(deadline, nowFn() + stepWaitMs);
        do {
          if (options.runtimeGuard?.isAborted?.()) {
            failureReason = "extension runtime changed during Visualize hydration";
            break;
          }
          const observedEntries = getVerifiedConversationTurnEntries(root);
          let recoveredAnswerThisPoll = false;
          if (!a1Snapshot) {
            const observedAnswer = mountedPreviousAnswerForRequestAnchor(
              observedEntries,
              q2Snapshot,
              [a2Snapshot]
            );
            if (observedAnswer.status === "found") {
              a1Snapshot = observedAnswer.a1Snapshot;
              recoveredAnswer = observedAnswer;
              recoveredAnswerThisPoll = true;
            } else if (observedAnswer.status === "conflict") {
              failureReason = observedAnswer.reason || "virtualized A1/Q2 overlap conflict";
              hydrationConflict = true;
              break;
            }
          }
          if (a1Snapshot) {
            const observedQuestion = mountedPreviousQuestionForAnchor(
              observedEntries,
              a1Snapshot,
              [q2Snapshot, a2Snapshot]
            );
            if (observedQuestion.status === "found") {
              recoveredQuestion = observedQuestion;
              break;
            }
            if (observedQuestion.status === "conflict") {
              failureReason = observedQuestion.reason || "virtualized Q1/A1 overlap conflict";
              hydrationConflict = true;
              break;
            }
            if (recoveredAnswerThisPoll) break;
          }
          if (nowFn() >= stepDeadline) break;
          await waitForHydrationPollFn(pollMs);
        } while (nowFn() <= stepDeadline);
        if (recoveredQuestion || hydrationConflict) break;
        if (nextTop === 0) break;
      }
    } catch (error) {
      failureReason = error?.message || "Visualize hydration failed";
    } finally {
      restored = await restoreVisualizeHydrationWindow({
        root,
        scrollContainer,
        scrollSnapshot,
        routeKey,
        anchors: { a1: a1Snapshot, q2: q2Snapshot, a2: a2Snapshot },
        expectedRichBlockCount,
        requireA1AtRestoredWindow,
        resolveCurrentScrollContainer: options.scrollContainer
          ? null
          : entry => resolveConversationScrollContainer(entry?.turn, { root }),
        followingNavigationAnchor,
        maxFollowingAnchorCorrectionPx,
        restoreProbeStepPx: scrollStepPx,
        timeoutMs: restorationTimeoutMs,
        pollMs,
        runtimeGuard: options.runtimeGuard,
        nowFn,
        waitForHydrationPollFn
      });
    }

    if (restored?.status !== "found") {
      return { mode: "unresolved", reason: restored?.reason || "Visualize hydration restoration failed" };
    }
    if (!a1Snapshot || !recoveredQuestion || (missingA1BeforeQ2 && !recoveredAnswer)) {
      return { mode: "unresolved", reason: failureReason };
    }
    if (conversationRouteKey() !== routeKey) {
      return { mode: "unresolved", reason: "conversation route changed during Visualize hydration" };
    }

    const answerNode = requireA1AtRestoredWindow
      ? restored.a1?.node || null
      : recoveredAnswer?.answerNode || null;
    const answerText = requireA1AtRestoredWindow
      ? hydrationTurnText(restored.a1)
      : recoveredAnswer?.answerText || "";
    if (!recoveredQuestion.questionText || !answerText) {
      return { mode: "unresolved", reason: "hydrated Q1 or A1 Markdown is empty" };
    }
    if (!answerNode) {
      return { mode: "unresolved", reason: "hydrated A1 conversion payload is missing" };
    }
    return {
      mode: "previous-qa",
      questionNode: null,
      answerNode,
      visualizeRequestNode: restored.q2.node,
      visualizeAnswerNode: restored.a2.node,
      questionText: recoveredQuestion.questionText,
      answerText,
      visualizeRequestText: restored.requestText,
      hydratedFromVirtualizedTurns: true,
      hydrationRecovery: {
        attempted: false,
        root,
        scrollContainer,
        resolveCurrentScrollContainer: options.scrollContainer
          ? null
          : entry => resolveConversationScrollContainer(entry?.turn, { root }),
        scrollSnapshot: Object.freeze({ ...scrollSnapshot }),
        restoreProbeStepPx: scrollStepPx,
        timeoutMs: restorationTimeoutMs,
        pollMs,
        nowFn,
        waitForHydrationPollFn
      },
      hydrationVerification: {
        routeKey,
        anchors: {
          q1: recoveredQuestion.q1Snapshot,
          a1: a1Snapshot,
          q2: q2Snapshot,
          a2: a2Snapshot
        },
        expectedRichBlockCount,
        proofKind: missingA1BeforeQ2 ? "sequential-overlap" : "a1-overlap",
        requireA1AtRestoredWindow,
        questionTextFingerprint: stableTurnFingerprint(recoveredQuestion.questionText),
        answerTextFingerprint: stableTurnFingerprint(answerText),
        answerNodeFingerprint: requireA1AtRestoredWindow
          ? ""
          : recoveredAnswer.answerFingerprint
      }
    };
  }

  function visualizeAttemptKeyForNode(currentAssistantNode) {
    const turn = currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || null;
    if (!turn) return "";
    const turnKey = verifiedTurnIdentity({ turn, node: currentAssistantNode }) || String(
      turn.getAttribute?.("data-turn-id") || turn.getAttribute?.("data-testid") || ""
    ).trim();
    const routeKey = conversationRouteKey();
    return routeKey && turnKey ? `${routeKey}::visualize-attempt::${turnKey}` : "";
  }

  function resolveVisualizeSaveContext(currentAssistantNode) {
    const unresolved = (reason, code = "") => ({ mode: "unresolved", reason, ...(code ? { code } : {}) });
    if (!currentAssistantNode) return unresolved("current assistant node was not found");
    if (roleAttrForNode(currentAssistantNode) !== "assistant") {
      return unresolved("current node is not an assistant turn");
    }

    const currentTurn = currentAssistantNode.closest?.("[data-testid^='conversation-turn-']") || null;
    if (!currentTurn) return unresolved("current assistant conversation turn was not found");
    const richAnswer = collectRichAppBlockCandidates(currentAssistantNode);
    if (!richAnswer.length) return unresolved("current assistant has no rich Visualize app block");

    const entries = getVerifiedConversationTurnEntries();
    const currentIndex = entries.findIndex(entry => entry.turn === currentTurn);
    if (currentIndex < 0) return unresolved("current assistant turn could not be resolved");
    const currentEntry = entries[currentIndex];
    if (currentEntry.ambiguous || currentEntry.role !== "assistant" || currentEntry.node !== currentAssistantNode) {
      return unresolved("current assistant turn is ambiguous");
    }

    const earlierEntries = entries.slice(0, currentIndex);
    const q2 = [...earlierEntries].reverse().find(entry => entry.role === "user" && !entry.ambiguous);
    if (!q2) return unresolved("Visualize request turn could not be resolved");
    const betweenQ2AndA2 = entries.slice(earlierEntries.indexOf(q2) + 1, currentIndex);
    if (betweenQ2AndA2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return unresolved("Q2 and A2 correspondence is ambiguous");
    }

    const visualizeRequestForAssistant = isVisualizeRequestForAssistant(q2.node, currentAssistantNode);
    const explicitVisualizeRequest = isExplicitVisualizeRequestNode(q2.node);
    if (!visualizeRequestForAssistant) return unresolved("the preceding user turn is not a Visualize request");

    const visualizeRequestText = visualizeRequestNodeToPlainText(q2.node);
    const referencesPreviousAnswer = isPreviousAnswerVisualizationRequestText(visualizeRequestText);
    // A marker-less retry variant is admitted only by the narrow existing
    // response-variant evidence. Preserve its prior Q/A behavior instead of
    // broadening direct mode beyond an explicit Visualize provider marker.
    const usePreviousQa = referencesPreviousAnswer || !explicitVisualizeRequest;

    if (usePreviousQa) {
      const priorAssistants = earlierEntries.filter(entry => entry.role === "assistant" && !entry.ambiguous);
      if (!priorAssistants.length) {
        return unresolved(
          "previous-answer Visualize request requires a verified Q1/A1 pair",
          "missing-a1-before-q2"
        );
      }
      const a1 = priorAssistants[priorAssistants.length - 1];
      const a1Index = entries.indexOf(a1);
      const betweenA1AndQ2 = entries.slice(a1Index + 1, entries.indexOf(q2));
      if (betweenA1AndQ2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
        return unresolved("Q1/A1 and Q2 candidates are ambiguous");
      }
      const priorUsers = entries.slice(0, a1Index).filter(entry => entry.role === "user" && !entry.ambiguous);
      const q1 = priorUsers[priorUsers.length - 1];
      if (!q1) return unresolved("Q1 could not be resolved before A1", "missing-q1-before-a1");
      const q1Index = entries.indexOf(q1);
      const betweenQ1AndA1 = entries.slice(q1Index + 1, a1Index);
      if (betweenQ1AndA1.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
        return unresolved("Q1/A1 correspondence is ambiguous");
      }
      const questionText = questionNodeToPlainText(q1.node);
      const renderedAnswer = assistantNodeToMarkdown(a1.node);
      const answerText = stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(
        renderedAnswer || String(a1.node.innerText || a1.node.textContent || "")
      )));
      if (!questionText || !answerText) return unresolved("Q1 or A1 Markdown is empty");
      return {
        mode: "previous-qa",
        questionNode: q1.node,
        answerNode: a1.node,
        visualizeRequestNode: q2.node,
        visualizeAnswerNode: currentAssistantNode,
        questionText,
        answerText,
        visualizeRequestText
      };
    }

    // An independent Q2 owns its resulting A2 even when a complete earlier
    // exchange exists. Keep failing closed on incomplete or ambiguous earlier
    // role evidence, but do not substitute the verified Q1/A1 body merely
    // because it is present.
    const entriesBeforeQ2 = entries.slice(0, entries.indexOf(q2));
    if (entriesBeforeQ2.some(entry => entry.ambiguous)) {
      return unresolved("an earlier conversation turn is ambiguous");
    }
    const earlierRoles = entriesBeforeQ2
      .filter(entry => entry.role === "user" || entry.role === "assistant")
      .map(entry => entry.role);
    let roleIndex = earlierRoles[0] === "assistant" ? 1 : 0;
    let earlierHistoryComplete = roleIndex === 0 || earlierRoles.length >= 1;
    while (earlierHistoryComplete && roleIndex < earlierRoles.length) {
      if (earlierRoles[roleIndex] !== "user" || earlierRoles[roleIndex + 1] !== "assistant") {
        earlierHistoryComplete = false;
        break;
      }
      roleIndex += 2;
    }
    if (!earlierHistoryComplete) {
      return unresolved("an earlier Q1/A1 candidate is incomplete");
    }
    if (!explicitVisualizeRequest) return unresolved("direct mode requires an explicit Visualize plugin marker");
    const questionText = visualizeRequestText;
    if (!questionText) return unresolved("Visualize request Markdown is empty");
    return {
      mode: "direct-visualize",
      questionNode: null,
      answerNode: null,
      visualizeRequestNode: q2.node,
      visualizeAnswerNode: currentAssistantNode,
      questionText,
      answerText: "",
      visualizeRequestText: questionText
    };
  }

  function resolvePreviousQaRichAppSaveContext(currentAssistantNode) {
    const unresolved = reason => ({ mode: "unresolved", reason });
    const richAppEvidence = resolveProviderNeutralRichAppEvidence(currentAssistantNode);
    if (!richAppEvidence.ok) return unresolved(richAppEvidence.reason || "current assistant has no verified rich app runtime");

    const currentTurn = currentAssistantNode.closest?.("[data-testid^='conversation-turn-']") || null;
    const entries = getVerifiedConversationTurnEntries();
    const currentMatches = entries.filter(entry => entry.turn === currentTurn);
    if (currentMatches.length !== 1) return unresolved("current assistant turn is missing or duplicated");
    const currentEntry = currentMatches[0];
    const currentIndex = entries.indexOf(currentEntry);
    if (currentIndex < 0 || currentEntry.ambiguous || currentEntry.role !== "assistant" || currentEntry.node !== currentAssistantNode) {
      return unresolved("current assistant turn is ambiguous");
    }

    const q2 = [...entries.slice(0, currentIndex)].reverse().find(entry => entry.role === "user" && !entry.ambiguous);
    if (!q2) return unresolved("provider-neutral rich app request turn could not be resolved");
    const q2Index = entries.indexOf(q2);
    const betweenQ2AndA2 = entries.slice(q2Index + 1, currentIndex);
    if (betweenQ2AndA2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return unresolved("Q2 and rich app answer correspondence is ambiguous");
    }

    const pluginMentionSelector = [
      "[data-id^='plugin:']",
      "[data-plugin-id]",
      "[data-inline-selection-pill]",
      "[data-testid*='plugin' i]"
    ].join(",");
    if (nodesIncludingRoot(q2.node, pluginMentionSelector).length || isExplicitVisualizeRequestNode(q2.node)) {
      return unresolved("request has structured provider provenance; use the provider-specific resolver");
    }

    const a1 = [...entries.slice(0, q2Index)].reverse().find(entry => entry.role === "assistant" && !entry.ambiguous);
    if (!a1) return unresolved("A1 could not be resolved before the rich app request");
    const a1Index = entries.indexOf(a1);
    const betweenA1AndQ2 = entries.slice(a1Index + 1, q2Index);
    if (betweenA1AndQ2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return unresolved("A1 and Q2 correspondence is ambiguous");
    }
    if (collectRichAppBlockCandidates(a1.node).length) {
      return unresolved("A1 is itself a rich app result; use the continuation resolver");
    }

    const q1 = [...entries.slice(0, a1Index)].reverse().find(entry => entry.role === "user" && !entry.ambiguous);
    if (!q1) return unresolved("Q1 could not be resolved before A1");
    const q1Index = entries.indexOf(q1);
    const betweenQ1AndA1 = entries.slice(q1Index + 1, a1Index);
    if (betweenQ1AndA1.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return unresolved("Q1 and A1 correspondence is ambiguous");
    }

    const questionText = questionNodeToPlainText(q1.node);
    const renderedAnswer = assistantNodeToMarkdown(a1.node);
    const answerText = stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(
      renderedAnswer || String(a1.node.innerText || a1.node.textContent || "")
    )));
    if (!questionText || !answerText) return unresolved("Q1 or A1 Markdown is empty");
    return {
      mode: "previous-qa-rich-app",
      questionNode: q1.node,
      answerNode: a1.node,
      requestNode: q2.node,
      currentAppAnswerNode: currentAssistantNode,
      questionText,
      answerText,
      provider: "unknown",
      richAppEvidence
    };
  }

  function revalidatePreviousQaRichAppContext(currentAssistantNode, expectedContext) {
    if (!expectedContext || expectedContext.mode !== "previous-qa-rich-app" || expectedContext.provider !== "unknown") {
      return { ok: false, reason: "provider-neutral rich app context is missing or has invalid provenance" };
    }
    const currentContext = resolvePreviousQaRichAppSaveContext(currentAssistantNode);
    if (currentContext.mode !== "previous-qa-rich-app") {
      return { ok: false, reason: currentContext.reason || "provider-neutral rich app evidence could not be revalidated" };
    }
    const sameContext = currentContext.currentAppAnswerNode === currentAssistantNode
      && expectedContext.currentAppAnswerNode === currentAssistantNode
      && currentContext.questionNode === expectedContext.questionNode
      && currentContext.answerNode === expectedContext.answerNode
      && currentContext.requestNode === expectedContext.requestNode
      && currentContext.provider === "unknown";
    if (!sameContext) {
      return { ok: false, reason: "provider-neutral rich app context changed before Share" };
    }
    return { ok: true, context: currentContext };
  }

  // ChatGPT may serialize a follow-up action from an interactive app as an
  // ordinary user turn without retaining the original plugin mention. Keep
  // that topology separate from the strict Visualize resolver: a continuation
  // is provider-neutral and is admitted only when the DOM proves A0(app) ->
  // Q2(user) -> A2(app) with no intervening real Q/A turns.
  function resolveRichAppContinuationContext(currentAssistantNode) {
    const unresolved = reason => ({ mode: "unresolved", reason });
    if (!currentAssistantNode) return unresolved("current assistant node was not found");
    if (roleAttrForNode(currentAssistantNode) !== "assistant") {
      return unresolved("current node is not an assistant turn");
    }

    const currentTurn = currentAssistantNode.closest?.("[data-testid^='conversation-turn-']") || null;
    if (!currentTurn) return unresolved("current assistant conversation turn was not found");
    if (!collectRichAppBlockCandidates(currentAssistantNode).length) {
      return unresolved("current assistant has no rich app block");
    }

    const entries = getVerifiedConversationTurnEntries();
    const currentMatches = entries.filter(entry => entry.turn === currentTurn);
    if (currentMatches.length !== 1) return unresolved("current assistant turn is missing or duplicated");
    const currentIndex = entries.indexOf(currentMatches[0]);
    if (currentIndex < 0 || currentMatches[0].ambiguous || currentMatches[0].role !== "assistant" || currentMatches[0].node !== currentAssistantNode) {
      return unresolved("current assistant turn is ambiguous");
    }

    const earlierEntries = entries.slice(0, currentIndex);
    const q2 = [...earlierEntries].reverse().find(entry => entry.role === "user" && !entry.ambiguous);
    if (!q2) return unresolved("continuation request turn could not be resolved");
    if (isVisualizeRequestForAssistant(q2.node, currentAssistantNode)) {
      return unresolved("request has explicit Visualize provenance; use the strict Visualize resolver");
    }
    const pluginMentionSelector = [
      "[data-id^='plugin:']",
      "[data-plugin-id]",
      "[data-inline-selection-pill]",
      "[data-testid*='plugin' i]"
    ].join(",");
    if (nodesIncludingRoot(q2.node, pluginMentionSelector).length) {
      return unresolved("request has plugin provenance; continuation provider is not unknown");
    }
    const q2Index = entries.indexOf(q2);
    const betweenQ2AndA2 = entries.slice(q2Index + 1, currentIndex);
    if (betweenQ2AndA2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return unresolved("continuation Q2 and A2 correspondence is ambiguous");
    }

    const a0 = [...entries.slice(0, q2Index)].reverse().find(entry => entry.role === "assistant" && !entry.ambiguous);
    if (!a0) return unresolved("previous app answer turn could not be resolved");
    const a0Index = entries.indexOf(a0);
    const betweenA0AndQ2 = entries.slice(a0Index + 1, q2Index);
    if (betweenA0AndQ2.some(entry => entry.ambiguous || entry.role === "user" || entry.role === "assistant")) {
      return unresolved("continuation A0 and Q2 correspondence is ambiguous");
    }
    if (!collectRichAppBlockCandidates(a0.node).length) {
      return unresolved("previous assistant turn has no rich app block");
    }

    const questionText = questionNodeToPlainText(q2.node);
    if (!questionText) return unresolved("continuation request Markdown is empty");
    return {
      mode: "rich-app-continuation",
      previousAppAnswerNode: a0.node,
      requestNode: q2.node,
      currentAppAnswerNode: currentAssistantNode,
      // The live DOM supplies no trustworthy provider marker for this path.
      provider: "unknown",
      questionText,
      visualizeRequestText: questionText
    };
  }

  function htmlOrClipboardToMarkdown(btn, clipboardText, preferClipboard = false) {
    const html = extractAssistantMessageHTML(btn);
    if (html) {
      const md = htmlToMarkdown(html);
      if (md && md.length > 10) return md;
    }
    return clipboardText || "";
  }

  function decodePercentEncodedRuns(text) {
    return String(text || "").replace(/(?:%[0-9a-f]{2}){2,}/gi, (encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    });
  }

  function normalizeChatGptShareUrl(raw) {
    const value = String(raw || "").trim();
    if (!value || /\s/.test(value)) return "";
    if (/^\/\//.test(value)) return "";
    if (/^https:\/\//i.test(value) && !/^https:\/\/chatgpt\.com\//i.test(value)) return "";
    let url;
    try {
      url = new URL(value, "https://chatgpt.com");
    } catch {
      return "";
    }
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com" || url.port || url.username || url.password || url.search || url.hash) {
      return "";
    }
    if (!/^\/(?:s|share)\/[^/?#]+$/i.test(url.pathname)) return "";
    return url.href;
  }

  function validateStrictChatGptShareUrl(raw) {
    const value = String(raw || "").trim();
    if (!value || /\s/.test(value) || !/^https:\/\/chatgpt\.com\//.test(value)) return "";
    let url;
    try {
      url = new URL(value);
    } catch {
      return "";
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "chatgpt.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/(?:s|share)\/[^/?#]+$/i.test(url.pathname)
    ) {
      return "";
    }
    return url.href;
  }

  function extractValidatedChatGptShareUrl(dialog) {
    if (!dialog) return "";
    const candidates = [];
    const add = value => {
      const text = String(value || "").trim();
      if (text) candidates.push(text);
    };
    const isVisible = node => elementVisibilityDetails(node).visible;

    for (const node of nodesIncludingRoot(dialog, "input, textarea")) {
      if (!isVisible(node)) continue;
      add(node.value);
      add(node.getAttribute?.("value"));
    }
    for (const node of nodesIncludingRoot(dialog, "a[href]")) {
      if (!isVisible(node)) continue;
      add(node.getAttribute?.("href") || node.href);
    }
    for (const node of nodesIncludingRoot(dialog, "[data-share-url], [data-share-link], [data-url]")) {
      if (!isVisible(node)) continue;
      add(node.getAttribute?.("data-share-url"));
      add(node.getAttribute?.("data-share-link"));
      add(node.getAttribute?.("data-url"));
    }
    const dialogText = isVisible(dialog)
      ? String(dialog.innerText || dialog.textContent || "")
      : "";
    const textMatches = dialogText.match(/https?:\/\/[^\s<>'"`]+/gi) || [];
    textMatches.forEach(add);

    const validated = new Set();
    for (const candidate of candidates) {
      const normalized = normalizeChatGptShareUrl(candidate.replace(/[),.;!?]+$/g, ""));
      if (normalized) validated.add(normalized);
    }
    return validated.size === 1 ? Array.from(validated)[0] : "";
  }

  function getShareSurfaceCandidates(root = document) {
    const scope = root || document;
    return nodesIncludingRoot(scope, [
      "[role='dialog']",
      "dialog",
      "[role='menu']",
      "[role='region']",
      "[aria-modal='true']",
      "[data-testid*='share-dialog' i]",
      "[data-testid*='share-sheet' i]",
      "[data-testid*='share-popover' i]",
      "[data-side]"
    ].join(","));
  }

  // Some ChatGPT builds use the conversation header Share button as an
  // immediate-copy shortcut when a public conversation link already exists.
  // That outcome is not a share surface and must therefore be observed by a
  // separate, narrowly scoped signal detector rather than by broadening the
  // generic share-surface selector above.
  function isWholeConversationShareCopySuccessText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    return /공개\s*링크가\s*클립보드에\s*복사(?:되었습니다|됐습니다|되었|됨)/i.test(text) &&
      /이\s*링크가\s*있으면\s*누구나\s*이\s*대화를\s*볼\s*수\s*있습니다/i.test(text);
  }

  function conversationShareCopySignalEntries(root = document) {
    const candidates = nodesIncludingRoot(root || document, "[role='status'], [role='alert'], [aria-live]")
      .filter(node => node?.isConnected !== false)
      .filter(node => !node?.closest?.("[data-testid^='conversation-turn-']"))
      .filter(node => elementVisibilityDetails(node).visible);
    const entries = [];
    const seen = new Set();
    for (const node of candidates) {
      const text = String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
      if (!isWholeConversationShareCopySuccessText(text) || seen.has(node)) continue;
      seen.add(node);
      entries.push({
        node,
        role: String(node?.getAttribute?.("role") || ""),
        ariaLive: String(node?.getAttribute?.("aria-live") || ""),
        text,
        signature: JSON.stringify({
          role: String(node?.getAttribute?.("role") || ""),
          ariaLive: String(node?.getAttribute?.("aria-live") || ""),
          text
        })
      });
    }
    return entries;
  }

  function isConversationShareAccessibilityMirror(entry) {
    const node = entry?.node;
    if (!node?.classList?.contains?.("sr-only")) return false;
    const role = String(entry?.role || node.getAttribute?.("role") || "").trim().toLowerCase();
    const ariaLive = String(entry?.ariaLive || node.getAttribute?.("aria-live") || "").trim().toLowerCase();
    return (role === "status" || role === "alert") && (ariaLive === "polite" || ariaLive === "assertive");
  }

  function canonicalizeConversationShareCopySignals(entries = []) {
    const candidates = Array.from(entries || []);
    if (candidates.length !== 2) return candidates;
    const mirrors = candidates.filter(isConversationShareAccessibilityMirror);
    const visualSignals = candidates.filter(entry => !isConversationShareAccessibilityMirror(entry));
    if (mirrors.length !== 1 || visualSignals.length !== 1) return candidates;
    return [{
      ...visualSignals[0],
      accessibilityMirror: mirrors[0].node,
      semanticSignature: "whole-conversation-public-link-copied"
    }];
  }

  function captureConversationShareCopySignals(root = document) {
    return conversationShareCopySignalEntries(root);
  }

  function getVisibleShareDialogs(root = document) {
    return getShareSurfaceCandidates(root)
      .filter(surface => shareSurfaceVisibilityDetails(surface).visible);
  }

  function shareSurfaceVisibilityDetails(surface) {
    const base = elementVisibilityDetails(surface);
    const stateClosed = /^(?:closed|hidden)$/i.test(String(surface?.getAttribute?.("data-state") || ""));
    const ariaHidden = /^true$/i.test(String(surface?.getAttribute?.("aria-hidden") || ""));
    const explicitlyHidden = surface?.hidden === true || surface?.hasAttribute?.("hidden");
    return {
      ...base,
      stateClosed,
      ariaHidden,
      explicitlyHidden,
      visible: base.visible && !stateClosed && !ariaHidden && !explicitlyHidden
    };
  }

  function isCopyShareLinkControl(node) {
    if (!isVisibleEnabledControl(node)) return false;
    const marker = [
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.innerText || "",
      node.textContent || "",
      controlLabel(node)
    ].join(" ").replace(/\s+/g, " ").trim();
    return /(?:copy\s*(?:share\s*)?link|(?:share\s*)?link\s*copy|링크\s*복사|공유\s*링크\s*복사)/i.test(marker);
  }

  function findCopyShareLinkButton(surface) {
    if (!surface?.querySelectorAll) return null;
    const controls = nodesIncludingRoot(surface, "button, [role='button'], [role='menuitem']")
      .filter(isCopyShareLinkControl);
    return controls.length === 1 ? controls[0] : null;
  }

  function isCopySuccessText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    return !!text && (
      /(?:^|\b)(?:copied|link copied|copy complete|copy successful)(?:\b|$)/i.test(text) ||
      /(?:복사됨|복사 완료|링크가 복사|복사되었|복사됐|클립보드.{0,20}복사)/.test(text)
    );
  }

  function copySuccessEntries(surface, control) {
    const candidates = new Set();
    if (control?.isConnected !== false && (!surface?.contains || surface.contains(control))) candidates.add(control);
    nodesIncludingRoot(surface, "button, [role='button'], [role='status'], [aria-live]")
      .forEach(node => candidates.add(node));
    const entries = [];
    for (const node of candidates) {
      if (!elementVisibilityDetails(node).visible) continue;
      const channels = [
        ["aria-label", node.getAttribute?.("aria-label") || ""],
        ["title", node.getAttribute?.("title") || ""],
        ["innerText", node.innerText || ""],
        ["textContent", node.textContent || ""]
      ];
      const seen = new Set();
      for (const [channel, rawValue] of channels) {
        const value = String(rawValue || "").replace(/\s+/g, " ").trim().toLowerCase();
        const key = `${channel}\u0000${value}`;
        if (!value || seen.has(key) || !isCopySuccessText(value)) continue;
        seen.add(key);
        entries.push({ node, channel, value });
      }
    }
    return entries;
  }

  function captureCopySuccessState(surface, control, options = {}) {
    const surfaces = new Set([surface]);
    if (typeof options.getDialogs === "function") {
      try {
        for (const candidate of Array.from(options.getDialogs() || [])) {
          if (shareSurfaceVisibilityDetails(candidate).visible) surfaces.add(candidate);
        }
      } catch {}
    }
    return {
      entries: copySuccessEntries(surface, control),
      surface,
      surfaces: Array.from(surfaces).map(candidate => ({
        surface: candidate,
        entries: copySuccessEntries(candidate, candidate === surface ? control : null)
      }))
    };
  }

  async function waitForCopySuccess(surface, control, options = {}) {
    const beforeEntries = Array.from(options.beforeState?.entries || []);
    const beforeSurfaces = Array.from(options.beforeState?.surfaces || []);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : 3000;
    const schedule = options.setTimeout || setTimeout;
    const cancelTimer = options.clearTimeout || clearTimeout;
    const mutationObserverClass = options.MutationObserver || globalThis.MutationObserver;
    return new Promise(resolve => {
      let settled = false;
      let timeoutTimer = null;
      let observer = null;
      const cleanup = () => {
        if (timeoutTimer !== null) cancelTimer(timeoutTimer);
        try { observer?.disconnect?.(); } catch {}
        timeoutTimer = null;
        observer = null;
      };
      const finish = result => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };
      const inspect = () => {
        if (settled) return;
        let activeSurface = surface;
        if (typeof options.getDialogs === "function") {
          const eligible = collapseNestedShareSurfaces(Array.from(options.getDialogs() || [])
            .filter(candidate => shareSurfaceVisibilityDetails(candidate).visible)
            .filter(candidate => classifyShareSurface(candidate) === "final" || copySuccessEntries(candidate, null).length > 0)
            .map(node => ({ node })))
            .map(item => item.node);
          if (eligible.length > 1) {
            finish({ ok: false, stage: "share-dialog", reason: "multiple visible share surfaces during Copy link confirmation" });
            return;
          }
          if (eligible.length === 1) activeSurface = eligible[0];
        }
        const surfaceBefore = beforeSurfaces.find(snapshot => snapshot?.surface === activeSurface);
        const activeBeforeEntries = surfaceBefore
          ? Array.from(surfaceBefore.entries || [])
          : activeSurface === options.beforeState?.surface
            ? beforeEntries
            : [];
        const currentEntries = copySuccessEntries(activeSurface, control);
        const hasFreshEntry = currentEntries.some(entry => !activeBeforeEntries.some(before => (
          before.node === entry.node && before.channel === entry.channel && before.value === entry.value
        )));
        if (hasFreshEntry) {
          finish({ ok: true, stage: "copy-success", surface: activeSurface });
        }
      };
      try {
        const observationRoot = options.root?.documentElement || surface?.ownerDocument?.documentElement || surface;
        if (typeof mutationObserverClass === "function" && observationRoot?.nodeType) {
          observer = new mutationObserverClass(inspect);
          observer.observe(observationRoot, { childList: true, subtree: true, attributes: true, characterData: true });
        }
      } catch {}
      timeoutTimer = schedule(() => finish({ ok: false, stage: "copy-success", reason: "copy success signal was not observed" }), timeoutMs);
      inspect();
    });
  }

  function isUpdateShareLinkControl(node) {
    if (!isVisibleEnabledShareAction(node)) return false;
    const marker = [
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      controlLabel(node)
    ].join(" ").replace(/\s+/g, " ").trim();
    return /(?:update\s*(?:share\s*)?link|(?:share\s*)?link\s*update|링크\s*업데이트|공유\s*링크\s*업데이트)/i.test(marker);
  }

  function hasExistingShareSurfaceStructure(surface) {
    if (!surface?.querySelectorAll) return false;
    const controls = nodesIncludingRoot(surface, "button, [role='button']");
    const copyControls = controls.filter(isCopyShareLinkControl);
    const updateControls = controls.filter(isUpdateShareLinkControl);
    const closeControls = controls.filter(node => shareDialogControlScore(node, "close") >= 0);
    const socialControls = controls.filter(node => /^(?:x|twitter|linkedin|reddit|facebook|whatsapp|email|메일)$/i.test(controlLabel(node)));
    const existingLinkControls = copyControls.length + updateControls.length;
    return existingLinkControls >= 1 && existingLinkControls <= 2 && (closeControls.length === 1 || socialControls.length >= 2);
  }

  function isLikelyShareDialog(dialog) {
    if (!dialog) return false;
    return !!extractValidatedChatGptShareUrl(dialog) ||
      !!findCreateShareLinkButton(dialog) ||
      hasExistingShareSurfaceStructure(dialog);
  }

  function shareDialogControlScore(node, kind) {
    if (!isVisibleEnabledControl(node)) return -1;
    const values = [
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      controlLabel(node)
    ].map(value => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const marker = values.join(" ");
    const isCreate = /(?:create\s*(?:a\s*)?(?:share\s*)?link|make\s*(?:a\s*)?link|generate\s*(?:a\s*)?link|링크\s*(?:만들기|생성)|공유\s*링크\s*(?:만들기|생성))/i.test(marker);
    const isClose = /(?:^|[\s_-])(?:close|닫기)(?:$|[\s_-])/i.test(marker) || /^(?:close|닫기)$/i.test(marker);
    if (kind === "create" && !isCreate) return -1;
    if (kind === "close" && !isClose) return -1;
    let score = 20;
    if (/(?:create|make|share).*(?:link|url)|(?:link|url).*(?:create|make|share)|(?:링크|공유).*(?:만들기|생성)/i.test(String(node.getAttribute?.("data-testid") || ""))) score += 100;
    if (kind === "close" && /close|닫기/i.test(String(node.getAttribute?.("data-testid") || ""))) score += 100;
    if (/^(?:create\s*(?:a\s*)?(?:share\s*)?link|make\s*(?:a\s*)?link|generate\s*(?:a\s*)?link|링크\s*(?:만들기|생성)|공유\s*링크\s*(?:만들기|생성))$/i.test(controlLabel(node))) score += 40;
    if (kind === "close" && /^(?:close|닫기)$/i.test(controlLabel(node))) score += 40;
    return score;
  }

  function findShareDialogControl(dialog, kind) {
    if (!dialog?.querySelectorAll) return null;
    const controls = nodesIncludingRoot(dialog, "button, [role='button']");
    const scored = controls
      .map((node, index) => ({ node, index, score: shareDialogControlScore(node, kind) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    if (!scored.length) return null;
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].node;
  }

  function findCreateShareLinkButton(dialog) {
    return findShareDialogControl(dialog, "create");
  }

  function findCloseShareDialogButton(dialog) {
    return findShareDialogControl(dialog, "close");
  }

  function intermediateShareActionScore(node) {
    if (!isVisibleEnabledShareAction(node)) return -1;
    const marker = [
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      controlLabel(node)
    ].join(" ").replace(/\s+/g, " ").trim();
    if (/(?:copy|복사|create|make|generate|만들기|생성|update|업데이트|delete|remove|삭제|close|닫기)/i.test(marker)) return -1;
    if (!/(?:^|[\s_-])(?:share|공유|공유하기)(?:$|[\s_-])/i.test(marker)) return -1;
    let score = 20;
    if (/share/i.test(String(node.getAttribute?.("data-testid") || ""))) score += 100;
    if (/^(?:share|share link|공유|공유하기|공유 링크)$/i.test(controlLabel(node))) score += 50;
    return score;
  }

  function findIntermediateShareAction(surface) {
    if (!surface?.querySelectorAll) return { control: null, ambiguous: false, count: 0 };
    const scored = nodesIncludingRoot(surface, "button, [role='button'], [role='menuitem']")
      .map((node, index) => ({ node, index, score: intermediateShareActionScore(node) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    if (!scored.length) return { control: null, ambiguous: false, count: 0 };
    if (scored.length > 1) {
      return { control: null, ambiguous: true, count: scored.length };
    }
    return { control: scored[0].node, ambiguous: false, count: scored.length };
  }

  function isIntermediateShareSurface(surface) {
    const role = String(surface?.getAttribute?.("role") || "").toLowerCase();
    const testId = String(surface?.getAttribute?.("data-testid") || "");
    const popoverLike = role === "menu" || /(?:popover|menu)/i.test(testId) || surface?.hasAttribute?.("data-side");
    return popoverLike && findIntermediateShareAction(surface).count > 0;
  }

  function classifyShareSurface(surface) {
    if (!surface) return "";
    if (extractValidatedChatGptShareUrl(surface) || findCreateShareLinkButton(surface) || hasExistingShareSurfaceStructure(surface)) {
      return "final";
    }
    if (isIntermediateShareSurface(surface)) return "intermediate";
    return "";
  }

  function collapseNestedShareSurfaces(items) {
    const list = Array.from(items || []);
    return list.filter(item => !list.some(other => (
      other !== item &&
      item?.node?.contains?.(other?.node)
    )));
  }

  function captureShareSurfaceSnapshot(surface) {
    const visibility = shareSurfaceVisibilityDetails(surface);
    const controls = nodesIncludingRoot(surface, "button, [role='button']");
    const markerCounts = {
      create: controls.filter(node => shareDialogControlScore(node, "create") >= 0).length,
      close: controls.filter(node => shareDialogControlScore(node, "close") >= 0).length,
      copy: controls.filter(isCopyShareLinkControl).length,
      update: controls.filter(isUpdateShareLinkControl).length
    };
    const state = {
      visible: visibility.visible,
      role: String(surface?.getAttribute?.("role") || ""),
      ariaHidden: String(surface?.getAttribute?.("aria-hidden") || ""),
      ariaModal: String(surface?.getAttribute?.("aria-modal") || ""),
      dataState: String(surface?.getAttribute?.("data-state") || ""),
      hasValidatedShareUrl: !!extractValidatedChatGptShareUrl(surface),
      controlCount: controls.length,
      markerCounts
    };
    return { node: surface, ...state, signature: JSON.stringify(state) };
  }

  function captureShareSurfaceSnapshots(surfaces) {
    return Array.from(surfaces || []).map(captureShareSurfaceSnapshot);
  }

  function isCurrentVisibleFinalShareSurface(surface) {
    return !!surface &&
      surface.isConnected !== false &&
      shareSurfaceVisibilityDetails(surface).visible &&
      classifyShareSurface(surface) === "final";
  }

  function isSameNestedShareSurfaceFamily(first, second) {
    return !!first && !!second && (
      first === second ||
      first?.contains?.(second) ||
      second?.contains?.(first)
    );
  }

  function isResponseShareSurfaceSelectionFailure(result) {
    const reason = String(result?.reason || "");
    return reason === VERIFIED_RESPONSE_SHARE_SURFACE_MISSING ||
      reason === RESPONSE_SHARE_IFRAME_DUPLICATED ||
      reason === RESPONSE_SHARE_IFRAME_RELOCATION_MISMATCH;
  }

  function shareSurfaceChangedSinceBaseline(surface, beforeSnapshots = []) {
    const current = captureShareSurfaceSnapshot(surface);
    const previous = Array.from(beforeSnapshots || [])
      .find(item => item?.node === surface);
    return !previous || !previous.visible || previous.signature !== current.signature;
  }

  // ChatGPT can preserve the visible Share modal while React replaces the
  // backing DOM node. Reacquire only a single fresh final-surface family from
  // this exact Share attempt. Keeping the outermost final candidate preserves
  // a portaled app preview when its controls live in a nested region; the
  // hydrated A2 validator still has to prove the exact wrapper/source shape.
  function reacquireFreshFinalShareSurface(_preferredSurface, options = {}) {
    if (typeof options.getDialogs !== "function") {
      return {
        ok: false,
        stage: "share-dialog",
        reason: VERIFIED_RESPONSE_SHARE_SURFACE_MISSING,
        retryable: false
      };
    }
    let visibleSurfaces;
    try {
      visibleSurfaces = Array.from(options.getDialogs() || []);
    } catch (error) {
      return {
        ok: false,
        stage: "share-dialog",
        reason: error?.message || VERIFIED_RESPONSE_SHARE_SURFACE_MISSING,
        retryable: false
      };
    }
    const copySuccessSurface = options.copySuccessSurface || null;
    const admitCopySuccessCandidates = options.copyClicked === true &&
      options.copySignalObserved === true;
    const admitCopySuccessFamily = admitCopySuccessCandidates &&
      !!copySuccessSurface &&
      copySuccessSurface.isConnected !== false &&
      shareSurfaceVisibilityDetails(copySuccessSurface).visible &&
      copySuccessEntries(copySuccessSurface, null).length > 0;
    const candidates = visibleSurfaces
      .filter(surface => surface?.isConnected !== false)
      .filter(surface => shareSurfaceVisibilityDetails(surface).visible)
      .filter(surface => shareSurfaceChangedSinceBaseline(surface, options.beforeSurfaces))
      .map(node => ({
        node,
        kind: classifyShareSurface(node) || (
          admitCopySuccessCandidates && (
            (admitCopySuccessFamily && isSameNestedShareSurfaceFamily(node, copySuccessSurface)) ||
            copySuccessEntries(node, null).length > 0
          )
            ? "final"
            : ""
        )
      }))
      .filter(item => !!item.kind);
    const familyLeaves = collapseNestedShareSurfaces(candidates);
    if (familyLeaves.length !== 1 || familyLeaves[0].kind !== "final") {
      return {
        ok: false,
        stage: "share-dialog",
        reason: VERIFIED_RESPONSE_SHARE_SURFACE_MISSING,
        candidateCount: familyLeaves.length,
        retryable: familyLeaves.length === 0
      };
    }
    const leaf = familyLeaves[0].node;
    const familyChain = candidates
      .filter(item => item.kind === "final")
      .map(item => item.node)
      .filter(surface => (
        surface === leaf || surface?.contains?.(leaf)
      ));
    const representative = familyChain.find(surface => !familyChain.some(other => (
      other !== surface && other?.contains?.(surface)
    ))) || leaf;
    return {
      ok: true,
      surface: representative,
      reacquired: representative !== _preferredSurface
    };
  }

  // React can unmount S1 and mount its equivalent S2 on the next task. Wait
  // only for the empty-candidate gap; ambiguity, an intermediate surface, a
  // runtime change, or a failed A2 source proof remains terminal.
  async function waitForFreshFinalShareSurface(preferredSurface, options = {}) {
    const maxEmptyRetries = Number.isFinite(options.maxEmptyRetries)
      ? Math.max(0, Math.floor(options.maxEmptyRetries))
      : 2;
    const configuredPollMs = Number.isFinite(options.pollMs) ? Math.max(1, options.pollMs) : 25;
    const retryDelayMs = Number.isFinite(options.shareSurfaceRetryDelayMs)
      ? Math.max(1, options.shareSurfaceRetryDelayMs)
      : Math.min(25, configuredPollMs);
    const waitForRetry = options.waitForShareSurfaceRetry || (ms => sleep(ms));
    const validateSurface = typeof options.validateSurface === "function"
      ? options.validateSurface
      : null;
    const phase = String(options.phase || "share-surface-reacquire");

    const inspectCurrentState = () => {
      const surfaceStatus = reacquireFreshFinalShareSurface(preferredSurface, options);
      if (surfaceStatus.ok) {
        if (validateSurface) {
          const candidateStatus = validateSurface(surfaceStatus.surface);
          if (candidateStatus?.ok === false) return { ...candidateStatus, retryable: false };
        }
        return surfaceStatus;
      }
      if (!surfaceStatus.retryable) return surfaceStatus;
      if (validateSurface) {
        const preferredStatus = validateSurface(preferredSurface);
        if (preferredStatus?.ok === false &&
            String(preferredStatus.reason || "") !== VERIFIED_RESPONSE_SHARE_SURFACE_MISSING) {
          return { ...preferredStatus, retryable: false };
        }
      }
      return surfaceStatus;
    };

    if (options.runtimeGuard?.isAborted?.()) {
      return {
        ok: false,
        stage: "runtime",
        reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable"
      };
    }
    let surfaceStatus = inspectCurrentState();
    if (surfaceStatus.ok || !surfaceStatus.retryable || maxEmptyRetries === 0) return surfaceStatus;

    for (let attempt = 1; attempt <= maxEmptyRetries; attempt += 1) {
      await waitForRetry(retryDelayMs);
      if (options.runtimeGuard?.isAborted?.()) {
        return {
          ok: false,
          stage: "runtime",
          reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable"
        };
      }
      if (options.runtimeGuard?.check) {
        const runtimeStatus = await checkRuntimeGuard(options.runtimeGuard, `${phase}-retry-${attempt}`);
        if (!runtimeStatus?.ok) {
          return { ok: false, stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" };
        }
      }
      surfaceStatus = inspectCurrentState();
      if (surfaceStatus.ok || !surfaceStatus.retryable || attempt >= maxEmptyRetries) return surfaceStatus;
    }
    return {
      ok: false,
      stage: "share-dialog",
      reason: VERIFIED_RESPONSE_SHARE_SURFACE_MISSING,
      retryable: false
    };
  }

  async function waitForRelevantShareDialog(beforeDialogs = [], options = {}) {
    const root = options.root || document;
    const beforeSnapshots = new Map();
    Array.from(beforeDialogs || []).forEach(item => {
      const snapshot = item?.node ? item : captureShareSurfaceSnapshot(item);
      if (snapshot?.node) beforeSnapshots.set(snapshot.node, snapshot);
    });
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : SHARE_DIALOG_TIMEOUT_MS;
    const pollMs = Number.isFinite(options.pollMs) ? Math.max(1, options.pollMs) : SHARE_POLL_MS;
    const getDialogs = options.getDialogs || (() => getShareSurfaceCandidates(root));
    const nowFn = options.now || (() => Date.now());
    const schedule = options.setTimeout || setTimeout;
    const cancelTimer = options.clearTimeout || clearTimeout;
    const mutationObserverClass = options.MutationObserver || globalThis.MutationObserver;
    const startedAt = nowFn();
    const deadline = startedAt + timeoutMs;
    artifactDebugLog("observer-root", {
      tag: String((root?.documentElement || root)?.tagName || "document").toUpperCase(),
      role: String((root?.documentElement || root)?.getAttribute?.("role") || ""),
      testId: String((root?.documentElement || root)?.getAttribute?.("data-testid") || "").slice(0, 120),
      observesDocumentElement: !!root?.documentElement
    });

    return new Promise(resolve => {
      let settled = false;
      let checking = false;
      let pollTimer = null;
      let timeoutTimer = null;
      let observer = null;

      const cleanup = () => {
        if (pollTimer !== null) cancelTimer(pollTimer);
        if (timeoutTimer !== null) cancelTimer(timeoutTimer);
        try { observer?.disconnect?.(); } catch {}
        pollTimer = null;
        timeoutTimer = null;
        observer = null;
      };
      const finish = result => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };
      const inspect = async () => {
        if (settled || checking) return;
        checking = true;
        try {
          if (options.runtimeGuard?.isAborted?.()) {
            finish({ ok: false, stage: "runtime", reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable" });
            return;
          }
          if (options.runtimeGuard?.check) {
            const runtimeStatus = await checkRuntimeGuard(options.runtimeGuard, "share-dialog-wait");
            if (!runtimeStatus?.ok) {
              finish({ ok: false, stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" });
              return;
            }
          }
          const dialogs = collapseNestedShareSurfaces(Array.from(getDialogs() || [])
            .map(captureShareSurfaceSnapshot)
            .filter(snapshot => snapshot.visible)
            .filter(snapshot => {
              const previous = beforeSnapshots.get(snapshot.node);
              return !previous || !previous.visible || previous.signature !== snapshot.signature;
            })
            .map(snapshot => ({ node: snapshot.node, kind: classifyShareSurface(snapshot.node) }))
            .filter(item => !!item.kind));
          if (dialogs.length) {
            artifactDebugLog("visible-top-layer-after", {
              count: dialogs.length,
              surfaces: dialogs.slice(0, 6).map(item => ({ kind: item.kind, ...shareSurfaceDiagnostic(item.node) }))
            });
          }
          if (dialogs.length === 1) {
            finish({ ok: true, dialog: dialogs[0].node, surface: dialogs[0].node, kind: dialogs[0].kind });
            return;
          }
          if (dialogs.length > 1) {
            finish({ ok: false, stage: "share-dialog", reason: "multiple new visible share dialogs" });
            return;
          }
          if (nowFn() >= deadline) {
            finish({ ok: false, stage: "share-dialog", reason: "timed out waiting for a visible share surface state change" });
            return;
          }
        } catch (error) {
          finish({ ok: false, stage: "share-dialog", reason: error?.message || String(error) });
          return;
        } finally {
          checking = false;
        }
        if (!settled) pollTimer = schedule(inspect, pollMs);
      };

      try {
        const observationRoot = root?.documentElement || root;
        if (typeof mutationObserverClass === "function" && observationRoot?.nodeType) {
          observer = new mutationObserverClass(() => { void inspect(); });
          observer.observe(observationRoot, { childList: true, subtree: true, attributes: true });
        }
      } catch {}
      timeoutTimer = schedule(() => {
        finish({ ok: false, stage: "share-dialog", reason: "timed out waiting for a visible share surface state change" });
      }, timeoutMs);
      void inspect();
    });
  }

  // Conversation-level Share has two UI contracts in the wild: a dialog/menu
  // surface, or an existing public link copied directly to the clipboard. The
  // latter exposes only a fresh, strongly worded status message. Keep this
  // outcome resolver separate from waitForRelevantShareDialog() so response
  // shares and generic toasts never inherit conversation-wide semantics.
  async function waitForConversationShareOutcome({
    shareKind = "conversation",
    beforeSurfaces = [],
    beforeCopySignals = [],
    root = document,
    runtimeGuard = null,
    getDialogs = null,
    timeoutMs,
    pollMs,
    now,
    setTimeout: setTimer = setTimeout,
    clearTimeout: clearTimer = clearTimeout,
    MutationObserver: MutationObserverClass = globalThis.MutationObserver
  } = {}) {
    if (shareKind !== "conversation") {
      return {
        ok: false,
        kind: "unresolved",
        stage: "share-dialog",
        reason: "conversation share outcome requires shareKind=conversation"
      };
    }
    const scope = root || document;
    const surfaceSnapshots = new Map();
    Array.from(beforeSurfaces || []).forEach(item => {
      const snapshot = item?.node ? item : captureShareSurfaceSnapshot(item);
      if (snapshot?.node) surfaceSnapshots.set(snapshot.node, snapshot);
    });
    const copySignalSnapshots = new Map();
    Array.from(beforeCopySignals || []).forEach(item => {
      const node = item?.node || item;
      if (!node) return;
      const snapshot = item?.signature ? item : conversationShareCopySignalEntries(scope).find(entry => entry.node === node);
      if (snapshot?.node) copySignalSnapshots.set(snapshot.node, snapshot);
    });
    const timeout = Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : SHARE_DIALOG_TIMEOUT_MS;
    const interval = Number.isFinite(pollMs) ? Math.max(1, pollMs) : SHARE_POLL_MS;
    const getSurfaceNodes = getDialogs || (() => getShareSurfaceCandidates(scope));
    const nowFn = now || (() => Date.now());
    const startedAt = nowFn();
    const deadline = startedAt + timeout;

    return new Promise(resolve => {
      let settled = false;
      let checking = false;
      let pollTimer = null;
      let timeoutTimer = null;
      let observer = null;
      const cleanup = () => {
        if (pollTimer !== null) clearTimer(pollTimer);
        if (timeoutTimer !== null) clearTimer(timeoutTimer);
        try { observer?.disconnect?.(); } catch {}
        pollTimer = null;
        timeoutTimer = null;
        observer = null;
      };
      const finish = result => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };
      const inspect = async () => {
        if (settled || checking) return;
        checking = true;
        try {
          if (runtimeGuard?.isAborted?.()) {
            finish({ ok: false, kind: "unresolved", stage: "runtime", reason: runtimeGuard.getFailure?.()?.error || "runtime unavailable" });
            return;
          }
          if (runtimeGuard?.check) {
            const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "conversation-share-outcome-wait");
            if (!runtimeStatus?.ok) {
              finish({ ok: false, kind: "unresolved", stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" });
              return;
            }
          }

          const surfaces = collapseNestedShareSurfaces(Array.from(getSurfaceNodes() || [])
            .map(captureShareSurfaceSnapshot)
            .filter(snapshot => snapshot.visible)
            .filter(snapshot => {
              const previous = surfaceSnapshots.get(snapshot.node);
              return !previous || !previous.visible || previous.signature !== snapshot.signature;
            })
            .map(snapshot => ({ node: snapshot.node, surfaceKind: classifyShareSurface(snapshot.node) }))
            .filter(item => !!item.surfaceKind));
          const rawSignals = conversationShareCopySignalEntries(scope)
            .filter(entry => {
              const previous = copySignalSnapshots.get(entry.node);
              return !previous || previous.signature !== entry.signature;
            });
          const signals = canonicalizeConversationShareCopySignals(rawSignals);

          if (surfaces.length > 1 || signals.length > 1 || (surfaces.length && signals.length)) {
            let ambiguitySubtype = "";
            let reason = "";
            if (surfaces.length > 1 && signals.length > 0) {
              ambiguitySubtype = "multiple-surfaces-with-copy-signals";
              reason = "multiple fresh conversation share surfaces appeared with copy signals";
            } else if (surfaces.length > 1) {
              ambiguitySubtype = "multiple-surfaces";
              reason = "multiple fresh conversation share surfaces";
            } else if (signals.length > 1 && surfaces.length > 0) {
              ambiguitySubtype = "surface-with-multiple-copy-signals";
              reason = "a conversation share surface appeared with multiple fresh copy signals";
            } else if (signals.length > 1) {
              ambiguitySubtype = "multiple-copy-signals";
              reason = "multiple fresh conversation share copy signals";
            } else {
              ambiguitySubtype = "surface-and-copy-signal";
              reason = "a conversation share surface and copy signal appeared together";
            }
            finish({
              ok: false,
              kind: "unresolved",
              stage: "share-dialog",
              reason,
              ambiguitySubtype,
              surfaceCount: surfaces.length,
              copySignalCount: signals.length,
              rawCopySignalCount: rawSignals.length
            });
            return;
          }
          if (surfaces.length === 1) {
            finish({
              ok: true,
              kind: "surface",
              surface: surfaces[0].node,
              dialog: surfaces[0].node,
              surfaceKind: surfaces[0].surfaceKind
            });
            return;
          }
          if (signals.length === 1) {
            finish({ ok: true, kind: "instant-copy", signal: signals[0] });
            return;
          }
          if (nowFn() >= deadline) {
            finish({
              ok: false,
              kind: "unresolved",
              stage: "share-dialog",
              reason: "timed out waiting for a conversation share surface or fresh copy signal"
            });
            return;
          }
        } catch (error) {
          finish({ ok: false, kind: "unresolved", stage: "share-dialog", reason: error?.message || String(error) });
          return;
        } finally {
          checking = false;
        }
        if (!settled) pollTimer = setTimer(inspect, interval);
      };

      try {
        const observationRoot = scope?.documentElement || scope;
        if (typeof MutationObserverClass === "function" && observationRoot?.nodeType) {
          observer = new MutationObserverClass(() => { void inspect(); });
          observer.observe(observationRoot, { childList: true, subtree: true, attributes: true, characterData: true });
        }
      } catch {}
      timeoutTimer = setTimer(() => finish({
        ok: false,
        kind: "unresolved",
        stage: "share-dialog",
        reason: "timed out waiting for a conversation share surface or fresh copy signal"
      }), timeout);
      void inspect();
    });
  }

  async function waitForValidatedShareUrl(dialog, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : SHARE_URL_TIMEOUT_MS;
    const pollMs = Number.isFinite(options.pollMs) ? Math.max(1, options.pollMs) : SHARE_POLL_MS;
    const wait = options.sleep || (ms => sleep(ms));
    const nowFn = options.now || (() => Date.now());
    const deadline = nowFn() + timeoutMs;
    while (nowFn() <= deadline) {
      if (options.runtimeGuard?.isAborted?.()) {
        return { ok: false, stage: "runtime", reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable" };
      }
      if (options.runtimeGuard?.check) {
        const runtimeStatus = await checkRuntimeGuard(options.runtimeGuard, "share-url-wait");
        if (!runtimeStatus?.ok) return { ok: false, stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" };
      }
      let activeSurface = dialog;
      if (typeof options.getDialogs === "function") {
        const visibleFinalSurfaces = collapseNestedShareSurfaces(Array.from(options.getDialogs() || [])
          .filter(surface => shareSurfaceVisibilityDetails(surface).visible)
          .filter(surface => classifyShareSurface(surface) === "final")
          .map(node => ({ node })))
          .map(item => item.node);
        if (visibleFinalSurfaces.length > 1) {
          return { ok: false, stage: "share-dialog", reason: "multiple visible final share surfaces after Create link" };
        }
        if (visibleFinalSurfaces.length === 1) activeSurface = visibleFinalSurfaces[0];
      }
      const url = extractValidatedChatGptShareUrl(activeSurface);
      if (url) return { ok: true, url, surface: activeSurface };
      const copyControls = nodesIncludingRoot(activeSurface, "button, [role='button'], [role='menuitem']")
        .filter(isCopyShareLinkControl);
      if (copyControls.length > 0) {
        return {
          ok: false,
          stage: "share-url",
          reason: "the share URL is not exposed in the DOM and a Copy link control is available",
          copyAvailable: true,
          surface: activeSurface
        };
      }
      if (nowFn() >= deadline) break;
      await wait(pollMs);
    }
    return { ok: false, stage: "share-url", reason: "timed out waiting for a validated ChatGPT share URL" };
  }

  // Updating an existing whole-conversation link is a separate state
  // transition from merely opening its share surface. Wait for a post-click
  // final surface whose validated URL is available and whose visible control
  // state changed. A URL that was already present before the Update click is
  // not accepted while the Update control remains unchanged.
  async function waitForUpdatedConversationShareUrl(dialog, previousUrl = "", options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : SHARE_URL_TIMEOUT_MS;
    const pollMs = Number.isFinite(options.pollMs) ? Math.max(1, options.pollMs) : SHARE_POLL_MS;
    const wait = options.sleep || (ms => sleep(ms));
    const nowFn = options.now || (() => Date.now());
    const deadline = nowFn() + timeoutMs;
    const beforeSignature = options.beforeSignature || captureShareSurfaceSnapshot(dialog).signature;
    while (nowFn() <= deadline) {
      if (options.runtimeGuard?.isAborted?.()) {
        return { ok: false, stage: "runtime", reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable" };
      }
      if (options.runtimeGuard?.check) {
        const runtimeStatus = await checkRuntimeGuard(options.runtimeGuard, "share-update-wait");
        if (!runtimeStatus?.ok) return { ok: false, stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" };
      }
      let activeSurface = dialog;
      if (typeof options.getDialogs === "function") {
        const visibleFinalSurfaces = collapseNestedShareSurfaces(Array.from(options.getDialogs() || [])
          .filter(surface => shareSurfaceVisibilityDetails(surface).visible)
          .filter(surface => classifyShareSurface(surface) === "final")
          .map(node => ({ node })))
          .map(item => item.node);
        if (visibleFinalSurfaces.length > 1) {
          return { ok: false, stage: "share-update", reason: "multiple visible final share surfaces after Update link" };
        }
        if (visibleFinalSurfaces.length === 1) activeSurface = visibleFinalSurfaces[0];
      }
      const url = validateStrictChatGptShareUrl(extractValidatedChatGptShareUrl(activeSurface));
      const currentSignature = captureShareSurfaceSnapshot(activeSurface).signature;
      const updateControls = nodesIncludingRoot(activeSurface, "button, [role='button'], [role='menuitem']")
        .filter(isUpdateShareLinkControl);
      if (url && (url !== previousUrl || currentSignature !== beforeSignature || updateControls.length === 0)) {
        return { ok: true, url, surface: activeSurface };
      }
      if (nowFn() >= deadline) break;
      await wait(pollMs);
    }
    return { ok: false, stage: "share-update", reason: "a refreshed conversation share URL was not confirmed after Update link" };
  }

  function validateShareContextBoundary(
    options = {},
    phase = "share-context",
    stage = "share-context",
    boundaryContext = {}
  ) {
    const validator = options.validateShareContext;
    if (typeof validator !== "function") return { ok: true };
    try {
      const result = validator(phase, boundaryContext);
      if (result?.ok === false) {
        return {
          ok: false,
          stage: result.stage || stage,
          reason: result.reason || "hydrated Visualize context changed before Share"
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        stage,
        reason: error?.message || "hydrated Visualize context validation failed"
      };
    }
  }

  async function resolveShareUrlFromCopySurface(surface, options = {}) {
    const waitForSuccess = options.waitForCopySuccess || waitForCopySuccess;
    const readClipboardText = options.readClipboardText || (() => navigator.clipboard.readText());
    const requestManualUrl = options.requestManualShareUrl || requestManualVisualizeShareUrl;
    let clipboardText = "";
    let manualText = "";
    let activeSurface = surface;
    let copyButton = null;
    let copyClicked = false;
    let copySignalObserved = false;
    const checkRuntime = async phase => {
      if (options.runtimeGuard?.isAborted?.()) {
        return { ok: false, stage: "runtime", reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable" };
      }
      if (options.runtimeGuard?.check) {
        const status = await checkRuntimeGuard(options.runtimeGuard, phase);
        if (!status?.ok) return { ok: false, stage: "runtime", reason: status?.error || "runtime unavailable" };
      }
      const validateActiveSurface = (candidate = activeSurface) => validateShareContextBoundary(
        options,
        phase,
        "share-dialog",
        {
          shareKind: options.shareKind === "conversation" ? "conversation" : "response",
          shareSurface: candidate,
          copyClicked,
          copySignalObserved
        }
      );
      let contextStatus = validateActiveSurface();
      if (!contextStatus.ok && !isResponseShareSurfaceSelectionFailure(contextStatus)) {
        return contextStatus;
      }
      const verifiedCopyClosedSurface = contextStatus.ok &&
        copyClicked &&
        copySignalObserved &&
        (activeSurface?.isConnected === false || !shareSurfaceVisibilityDetails(activeSurface).visible);
      const hydratedResponseSurface = options.shareKind === "response" &&
        typeof options.validateShareContext === "function";
      if (verifiedCopyClosedSurface && hydratedResponseSurface) {
        const competingSurfaceStatus = reacquireFreshFinalShareSurface(activeSurface, {
          ...options,
          getDialogs: options.getDialogs,
          beforeSurfaces: options.shareSurfaceBaselineSnapshots,
          copySuccessSurface: activeSurface,
          copyClicked,
          copySignalObserved
        });
        const noFreshVisibleCandidate = !competingSurfaceStatus.ok &&
          competingSurfaceStatus.retryable === true &&
          competingSurfaceStatus.candidateCount === 0;
        if (!noFreshVisibleCandidate) {
          return {
            ok: false,
            stage: "share-dialog",
            reason: VERIFIED_RESPONSE_SHARE_SURFACE_MISSING
          };
        }
      } else if (hydratedResponseSurface) {
        const surfaceStatus = await waitForFreshFinalShareSurface(activeSurface, {
          ...options,
          getDialogs: options.getDialogs,
          beforeSurfaces: options.shareSurfaceBaselineSnapshots,
          runtimeGuard: options.runtimeGuard,
          phase,
          validateSurface: validateActiveSurface,
          copySuccessSurface: copyClicked && copySignalObserved ? activeSurface : null,
          copyClicked,
          copySignalObserved
        });
        if (!surfaceStatus.ok) return surfaceStatus;
        activeSurface = surfaceStatus.surface;
        contextStatus = validateActiveSurface();
      }
      if (!contextStatus.ok) return contextStatus;
      return { ok: true };
    };
    try {
      let runtimeStatus = await checkRuntime("share-copy-before-click");
      if (!runtimeStatus.ok) return runtimeStatus;
      copyButton = findCopyShareLinkButton(activeSurface);
      if (copyButton) {
        const beforeState = captureCopySuccessState(activeSurface, copyButton, options);
        try {
          copyButton.click();
          copyClicked = true;
        } catch {
          copyClicked = false;
        }
        if (copyClicked) {
          let signalResult = null;
          try {
            signalResult = await waitForSuccess(activeSurface, copyButton, {
              ...options,
              beforeState,
              timeoutMs: Number.isFinite(options.copySuccessTimeoutMs)
                ? options.copySuccessTimeoutMs
                : options.timeoutMs
            });
          } catch {}
          if (signalResult?.ok === false && signalResult?.stage === "share-dialog") {
            return signalResult;
          }
          copySignalObserved = signalResult?.ok === true;
          if (signalResult?.surface && !isSameNestedShareSurfaceFamily(activeSurface, signalResult.surface)) {
            activeSurface = signalResult.surface;
          }
          runtimeStatus = await checkRuntime("share-copy-after-signal");
          if (!runtimeStatus.ok) return runtimeStatus;
          if (copySignalObserved && options.clipboardPermissionGranted === true) {
            runtimeStatus = await checkRuntime("share-clipboard-before-read");
            if (!runtimeStatus.ok) return runtimeStatus;
            try {
              clipboardText = String(await readClipboardText() || "");
            } catch {
              clipboardText = "";
            }
            const validatedClipboardUrl = validateStrictChatGptShareUrl(clipboardText);
            if (validatedClipboardUrl) {
              runtimeStatus = await checkRuntime("share-clipboard-after-read");
              if (!runtimeStatus.ok) return runtimeStatus;
              return { ok: true, url: validatedClipboardUrl, copyClicked, copySignalObserved, source: "clipboard", surface: activeSurface };
            }
          }
        }
      }

      runtimeStatus = await checkRuntime("share-manual-before-open");
      if (!runtimeStatus.ok) return runtimeStatus;
      try {
        manualText = String(await requestManualUrl({
          copyClicked,
          copySignalObserved,
          clipboardPermissionGranted: options.clipboardPermissionGranted === true
        }) || "");
      } catch {
        manualText = "";
      }
      runtimeStatus = await checkRuntime("share-manual-after-close");
      if (!runtimeStatus.ok) return runtimeStatus;
      const validatedManualUrl = validateStrictChatGptShareUrl(manualText);
      if (validatedManualUrl) {
        return { ok: true, url: validatedManualUrl, copyClicked, copySignalObserved, source: "manual", surface: activeSurface };
      }
      return {
        ok: false,
        stage: "manual-share-url",
        reason: "a valid ChatGPT share URL was not provided",
        copyClicked,
        copySignalObserved
      };
    } finally {
      clipboardText = "";
      manualText = "";
    }
  }

  async function resolveShareUrlFromInstantCopy(signal, options = {}) {
    const readClipboardText = options.readClipboardText || (() => navigator.clipboard.readText());
    const requestManualUrl = options.requestManualShareUrl || requestManualVisualizeShareUrl;
    let clipboardText = "";
    let manualText = "";
    const checkRuntime = async phase => {
      if (options.runtimeGuard?.isAborted?.()) {
        return { ok: false, stage: "runtime", reason: options.runtimeGuard.getFailure?.()?.error || "runtime unavailable" };
      }
      if (options.runtimeGuard?.check) {
        const status = await checkRuntimeGuard(options.runtimeGuard, phase);
        if (!status?.ok) return { ok: false, stage: "runtime", reason: status.error || "runtime unavailable" };
      }
      const contextStatus = validateShareContextBoundary(options, phase, "share-dialog");
      if (!contextStatus.ok) return contextStatus;
      return { ok: true };
    };
    try {
      const signalText = String(signal?.text || signal?.node?.innerText || signal?.node?.textContent || "");
      if (!signal || !isWholeConversationShareCopySuccessText(signalText)) {
        return {
          ok: false,
          stage: "share-dialog",
          reason: "a fresh whole-conversation copy-success signal was not verified",
          shareInteraction: "instant-copy",
          conversationShareActionOccurred: true,
          signal
        };
      }
      let runtimeStatus = await checkRuntime("conversation-share-copy-after-signal");
      if (!runtimeStatus.ok) return runtimeStatus;
      if (options.clipboardPermissionGranted === true) {
        runtimeStatus = await checkRuntime("conversation-share-clipboard-before-read");
        if (!runtimeStatus.ok) return runtimeStatus;
        try {
          clipboardText = String(await readClipboardText() || "");
        } catch {
          clipboardText = "";
        }
        const validatedClipboardUrl = validateStrictChatGptShareUrl(clipboardText);
        if (validatedClipboardUrl) {
          return {
            ok: true,
            url: validatedClipboardUrl,
            source: "clipboard",
            shareInteraction: "instant-copy",
            conversationShareActionOccurred: true,
            signal
          };
        }
      }

      runtimeStatus = await checkRuntime("conversation-share-manual-before-open");
      if (!runtimeStatus.ok) return runtimeStatus;
      try {
        manualText = String(await requestManualUrl({
          copyClicked: true,
          copySignalObserved: true,
          clipboardPermissionGranted: options.clipboardPermissionGranted === true,
          shareKind: "conversation",
          signal
        }) || "");
      } catch {
        manualText = "";
      }
      runtimeStatus = await checkRuntime("conversation-share-manual-after-close");
      if (!runtimeStatus.ok) return runtimeStatus;
      const validatedManualUrl = validateStrictChatGptShareUrl(manualText);
      if (validatedManualUrl) {
        return {
          ok: true,
          url: validatedManualUrl,
          source: "manual",
          shareInteraction: "instant-copy",
          conversationShareActionOccurred: true,
          signal
        };
      }
      return {
        ok: false,
        stage: "manual-share-url",
        reason: "a valid ChatGPT share URL was not provided",
        shareInteraction: "instant-copy",
        conversationShareActionOccurred: true,
        signal
      };
    } finally {
      clipboardText = "";
      manualText = "";
    }
  }

  async function createOrReuseVisualizeShareLink(currentAssistantNode, options = {}) {
    const root = options.root || document;
    const shareKind = options.shareKind === "conversation" ? "conversation" : "response";
    const getDialogs = options.getDialogs || (() => getShareSurfaceCandidates(root));
    const waitForDialog = options.waitForRelevantShareDialog || waitForRelevantShareDialog;
    const waitForUrl = options.waitForValidatedShareUrl || waitForValidatedShareUrl;
    const waitForUpdatedUrl = options.waitForUpdatedShareUrl || waitForUpdatedConversationShareUrl;
    const requestUpdateConsent = options.requestConversationShareUpdateConsent || requestConversationShareUpdateConsent;
    const runtimeGuard = options.runtimeGuard || null;
    let shareSource = "";
    let shareCreatedThisAttempt = false;
    let shareUpdatedThisAttempt = false;
    let validatedShareUrl = "";
    let shareInteraction = "";
    let conversationShareActionOccurred = false;
    let responseCopyClicked = false;
    let responseCopySignalObserved = false;
    const fail = (stage, reason, details = {}) => ({
      ok: false,
      ...details,
      stage,
      reason,
      shareKind,
      shareSource,
      shareCreatedThisAttempt,
      shareUpdatedThisAttempt,
      validatedShareUrl,
      shareInteraction,
      conversationShareActionOccurred
    });
    const runtimeStatus = runtimeGuard?.check
      ? await checkRuntimeGuard(runtimeGuard, "share-button")
      : { ok: true };
    if (!runtimeStatus?.ok) return fail("runtime", runtimeStatus.error || "runtime unavailable");

    const shareRoot = options.shareRoot || (shareKind === "conversation" ? root : currentAssistantNode);
    let triggerResolution = null;
    let shareButton = null;
    if (typeof options.findShareButton === "function") {
      try { shareButton = options.findShareButton(shareRoot); } catch {}
    } else if (shareKind === "conversation") {
      triggerResolution = resolveConversationShareTrigger(root);
      if (triggerResolution.status !== "found") {
        artifactDebugLog("selected-share-trigger", { selected: false, kind: shareKind, reason: triggerResolution.reason });
        return fail("share-button", triggerResolution.reason || "conversation share button was not found or was ambiguous");
      }
      shareButton = triggerResolution.control;
    } else {
      triggerResolution = resolveResponseShareTrigger(shareRoot);
      if (triggerResolution.status !== "found") {
        artifactDebugLog("selected-share-trigger", { selected: false, kind: shareKind, reason: triggerResolution.reason });
        return fail("share-button", triggerResolution.reason || "current assistant share button was not found or was ambiguous");
      }
      shareButton = triggerResolution.control;
    }
    if (!shareButton) {
      artifactDebugLog("selected-share-trigger", { selected: false, kind: shareKind, reason: "missing-or-ambiguous" });
      return fail("share-button", "share button was not found or was ambiguous");
    }
    if (options.shareTrigger && options.shareTrigger !== shareButton) {
      return fail("share-button", "the selected share trigger changed before click");
    }

    // Re-resolve the trigger immediately before the side-effecting click. A
    // React re-render may have replaced the preflight node or changed its
    // visibility while the user was deciding about the share.
    if (typeof options.findShareButton !== "function") {
      const liveResolution = shareKind === "conversation"
        ? resolveConversationShareTrigger(root)
        : resolveResponseShareTrigger(shareRoot);
      if (liveResolution.status !== "found") {
        return fail("share-button", liveResolution.reason || "share trigger was not found immediately before click");
      }
      if (liveResolution.control !== shareButton) {
        return fail("share-button", "the selected share trigger changed before click");
      }
      triggerResolution = liveResolution;
    }
    artifactDebugLog("selected-share-trigger", { selected: true, kind: shareKind, trigger: shareElementDiagnostic(shareButton, currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || currentAssistantNode) });
    const beforeDialogs = captureShareSurfaceSnapshots(getDialogs() || []);
    const beforeCopySignals = shareKind === "conversation"
      ? captureConversationShareCopySignals(root)
      : [];
    artifactDebugLog("visible-top-layer-before", {
      count: beforeDialogs.filter(item => item.visible).length,
      surfaces: beforeDialogs.filter(item => item.visible).slice(0, 6).map(item => shareSurfaceDiagnostic(item.node))
    });
    if (!isVisibleEnabledControl(shareButton)) return fail("share-button", "share button is not visible or enabled");
    const beforeShareClickContext = validateShareContextBoundary(options, "share-button", "share-button");
    if (!beforeShareClickContext.ok) {
      return fail(beforeShareClickContext.stage, beforeShareClickContext.reason);
    }
    const triggerBeforeClick = shareElementDiagnostic(shareButton, currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || currentAssistantNode);
    try {
      shareButton.click();
      if (shareKind === "conversation") conversationShareActionOccurred = true;
    } catch (error) {
      return fail("share-button", error?.message || String(error));
    }
    artifactDebugLog("trigger-click-dispatched", {
      before: triggerBeforeClick,
      after: shareElementDiagnostic(shareButton, currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || currentAssistantNode)
    });

    let dialogResult;
    if (shareKind === "conversation") {
      let waitForConversationOutcome = options.waitForConversationShareOutcome || waitForConversationShareOutcome;
      // Preserve the legacy test/integration seam when a caller explicitly
      // injects the old dialog waiter. Production uses the new outcome
      // resolver; an injected legacy waiter is adapted to its surface result.
      if (!options.waitForConversationShareOutcome && typeof options.waitForRelevantShareDialog === "function") {
        waitForConversationOutcome = async ({ beforeSurfaces, ...outcomeOptions } = {}) => {
          const legacy = await options.waitForRelevantShareDialog(beforeSurfaces || [], outcomeOptions);
          if (!legacy?.ok) return legacy;
          return {
            ...legacy,
            kind: legacy.kind || "final",
            surface: legacy.surface || legacy.dialog,
            dialog: legacy.dialog || legacy.surface,
            surfaceKind: legacy.surfaceKind || legacy.kind || "final"
          };
        };
      }
      dialogResult = await waitForConversationOutcome({
        ...options,
        root,
        runtimeGuard,
        getDialogs,
        beforeSurfaces: beforeDialogs,
        beforeCopySignals
      });
    } else {
      dialogResult = await waitForDialog(beforeDialogs, {
        ...options,
        root,
        runtimeGuard,
        getDialogs
      });
    }
    if (!dialogResult?.ok) {
      return fail(dialogResult?.stage || "share-dialog", dialogResult?.reason || "share dialog was not found", dialogResult || {});
    }
    let shareUrl = "";
    if (shareKind === "conversation" && dialogResult.kind === "instant-copy") {
      shareInteraction = "instant-copy";
      const copyResult = await resolveShareUrlFromInstantCopy(dialogResult.signal, {
        ...options,
        runtimeGuard,
        clipboardPermissionGranted: options.clipboardPermissionGranted === true,
        requestManualShareUrl: options.requestManualShareUrl || requestManualVisualizeShareUrl
      });
      conversationShareActionOccurred = true;
      if (!copyResult?.ok) {
        return fail(copyResult?.stage || "manual-share-url", copyResult?.reason || "a valid ChatGPT share URL was not provided", {
          ...copyResult,
          shareInteraction,
          conversationShareActionOccurred
        });
      }
      shareSource = "existing";
      shareUrl = copyResult.url;
    }
    let dialog = dialogResult.dialog;
    let finalSurfaceBaselineSnapshots = beforeDialogs;
    const intermediateShareSurface = dialogResult.kind === "intermediate" ||
      (dialogResult.kind === "surface" && dialogResult.surfaceKind === "intermediate");
    if (intermediateShareSurface) {
      artifactDebugLog("intermediate-share-menu", shareSurfaceDiagnostic(dialog));
      const intermediate = findIntermediateShareAction(dialog);
      if (intermediate.ambiguous || !intermediate.control) {
        return fail("share-menu", intermediate.ambiguous ? "multiple intermediate share actions were equally eligible" : "an intermediate share action was not found");
      }
      const beforeFinalSurfaces = captureShareSurfaceSnapshots(getDialogs() || []);
      finalSurfaceBaselineSnapshots = beforeFinalSurfaces;
      if (runtimeGuard?.check) {
        const menuRuntimeStatus = await checkRuntimeGuard(runtimeGuard, "intermediate-share-menu");
        if (!menuRuntimeStatus?.ok) return fail("runtime", menuRuntimeStatus.error || "runtime unavailable");
      }
      const beforeMenuClickContext = validateShareContextBoundary(options, "intermediate-share-menu", "share-menu");
      if (!beforeMenuClickContext.ok) {
        return fail(beforeMenuClickContext.stage, beforeMenuClickContext.reason);
      }
      try {
        intermediate.control.click();
      } catch (error) {
        return fail("share-menu", error?.message || String(error));
      }
      const finalResult = await waitForDialog(beforeFinalSurfaces, {
        ...options,
        root,
        runtimeGuard,
        getDialogs
      });
      if (!finalResult?.ok) {
        return fail(finalResult?.stage || "share-dialog", finalResult?.reason || "final share surface was not found", finalResult || {});
      }
      if (finalResult.kind && finalResult.kind !== "final") return fail("share-dialog", "a final share surface did not open after the intermediate action");
      dialog = finalResult.dialog;
    }
    const validateFinalSurface = (candidate = dialog) => validateShareContextBoundary(
      options,
      "final-share-surface",
      "share-dialog",
      { shareKind, shareSurface: candidate }
    );
    let finalSurfaceContext = validateFinalSurface(dialog);
    if (!finalSurfaceContext.ok && !isResponseShareSurfaceSelectionFailure(finalSurfaceContext)) {
      return fail(finalSurfaceContext.stage, finalSurfaceContext.reason);
    }
    if (shareKind === "response" && typeof options.validateShareContext === "function") {
      const surfaceStatus = await waitForFreshFinalShareSurface(dialog, {
        ...options,
        getDialogs,
        beforeSurfaces: finalSurfaceBaselineSnapshots,
        runtimeGuard,
        phase: "final-share-surface",
        validateSurface: validateFinalSurface
      });
      if (!surfaceStatus.ok) {
        return fail(surfaceStatus.stage || "share-dialog", surfaceStatus.reason, surfaceStatus);
      }
      dialog = surfaceStatus.surface;
      finalSurfaceContext = validateFinalSurface(dialog);
    }
    if (!finalSurfaceContext.ok) {
      return fail(finalSurfaceContext.stage, finalSurfaceContext.reason);
    }
    artifactDebugLog("final-share-surface", shareSurfaceDiagnostic(dialog));
    if (!shareUrl) shareUrl = extractValidatedChatGptShareUrl(dialog);
    if (shareUrl) shareSource = "existing";
    artifactDebugLog("existing-share-url-detected", { detected: !!shareUrl, kind: shareKind });

    const finalControls = nodesIncludingRoot(dialog, "button, [role='button'], [role='menuitem']");
    const copyControlCount = finalControls.filter(isCopyShareLinkControl).length;
    const updateControls = finalControls.filter(isUpdateShareLinkControl);
    if (shareKind === "conversation" && updateControls.length > 0) {
      if (updateControls.length !== 1) {
        return fail("share-update", "multiple conversation Update link controls were found", { updateControlCount: updateControls.length });
      }
      const updateControl = updateControls[0];
      let updateConsentResult;
      try {
        updateConsentResult = await requestUpdateConsent({ dialog, currentAssistantNode, control: updateControl, existingShareUrl: shareUrl });
      } catch (error) {
        return fail("share-update", error?.message || "conversation share update consent failed");
      }
      const updateApproved = updateConsentResult === true || updateConsentResult?.approved === true;
      if (!updateApproved) return fail("share-update", "user declined updating the existing conversation share link");
      if (!isVisibleEnabledShareAction(updateControl)) return fail("share-update", "conversation Update link is not visible or enabled");
      if (runtimeGuard?.check) {
        const updateRuntimeStatus = await checkRuntimeGuard(runtimeGuard, "share-update");
        if (!updateRuntimeStatus?.ok) return fail("runtime", updateRuntimeStatus.error || "runtime unavailable");
      }
      const beforeUpdateClickContext = validateShareContextBoundary(options, "share-update", "share-update");
      if (!beforeUpdateClickContext.ok) {
        return fail(beforeUpdateClickContext.stage, beforeUpdateClickContext.reason);
      }
      const previousUrl = validateStrictChatGptShareUrl(shareUrl);
      const beforeUpdateSignature = captureShareSurfaceSnapshot(dialog).signature;
      try {
        updateControl.click();
        shareUpdatedThisAttempt = true;
      } catch (error) {
        return fail("share-update", error?.message || String(error));
      }
      let updatedResult;
      try {
        updatedResult = await waitForUpdatedUrl(dialog, previousUrl, {
          ...options,
          root,
          runtimeGuard,
          getDialogs,
          beforeSignature: beforeUpdateSignature
        });
      } catch (error) {
        return fail("share-update", error?.message || "updated conversation share URL could not be confirmed");
      }
      if (!updatedResult?.ok) {
        return fail(updatedResult?.stage || "share-update", updatedResult?.reason || "updated conversation share URL could not be confirmed", updatedResult || {});
      }
      if (updatedResult.surface) dialog = updatedResult.surface;
      shareUrl = updatedResult.url || extractValidatedChatGptShareUrl(dialog);
      shareSource = "existing";
    }

    if (!shareUrl) {
      if (hasExistingShareSurfaceStructure(dialog) || copyControlCount > 0 || updateControls.length > 0) {
        shareSource = "existing";
        const copyResult = await resolveShareUrlFromCopySurface(dialog, {
          ...options,
          shareKind,
          getDialogs,
          shareSurfaceBaselineSnapshots: finalSurfaceBaselineSnapshots
        });
        if (!copyResult?.ok) {
          return fail(copyResult?.stage || "manual-share-url", copyResult?.reason || "a valid ChatGPT share URL was not provided", copyResult || {});
        }
        responseCopyClicked = copyResult.copyClicked === true;
        responseCopySignalObserved = copyResult.copySignalObserved === true;
        if (copyResult.surface) dialog = copyResult.surface;
        shareUrl = copyResult.url;
      } else {
        const createButton = findCreateShareLinkButton(dialog);
        if (!createButton) return fail("create-link", "create-link button was not found or was ambiguous");
        if (runtimeGuard?.check) {
          const createRuntimeStatus = await checkRuntimeGuard(runtimeGuard, "create-link");
          if (!createRuntimeStatus?.ok) return fail("runtime", createRuntimeStatus.error || "runtime unavailable");
        }
        const beforeCreateClickContext = validateShareContextBoundary(options, "create-link", "create-link");
        if (!beforeCreateClickContext.ok) {
          return fail(beforeCreateClickContext.stage, beforeCreateClickContext.reason);
        }
        try {
          createButton.click();
        } catch (error) {
          return fail("create-link", error?.message || String(error));
        }
        artifactDebugLog("create-link-clicked", { control: shareElementDiagnostic(createButton), clickCount: 1 });
        shareSource = "created";
        shareCreatedThisAttempt = true;
        const urlResult = await waitForUrl(dialog, { ...options, runtimeGuard, getDialogs });
        if (urlResult?.surface) dialog = urlResult.surface;
        if (urlResult?.stage === "runtime") {
          return fail(urlResult.stage, urlResult.reason || "share flow was aborted", urlResult);
        }
        if (shareKind === "response" && typeof options.validateShareContext === "function") {
          let createdSurfaceContext = validateShareContextBoundary(
            options,
            "create-link-result",
            "share-dialog",
            { shareKind, shareSurface: dialog }
          );
          if (!createdSurfaceContext.ok && !isResponseShareSurfaceSelectionFailure(createdSurfaceContext)) {
            return fail(createdSurfaceContext.stage, createdSurfaceContext.reason);
          }
          const validateCreatedSurface = candidate => validateShareContextBoundary(
            options,
            "create-link-result",
            "share-dialog",
            { shareKind, shareSurface: candidate }
          );
          const createdSurfaceStatus = await waitForFreshFinalShareSurface(dialog, {
            ...options,
            getDialogs,
            beforeSurfaces: finalSurfaceBaselineSnapshots,
            runtimeGuard,
            phase: "create-link-result",
            validateSurface: validateCreatedSurface
          });
          if (!createdSurfaceStatus.ok) {
            return fail(createdSurfaceStatus.stage || "share-dialog", createdSurfaceStatus.reason, createdSurfaceStatus);
          }
          dialog = createdSurfaceStatus.surface;
          createdSurfaceContext = validateCreatedSurface(dialog);
          if (!createdSurfaceContext.ok) {
            return fail(createdSurfaceContext.stage, createdSurfaceContext.reason);
          }
        }
        if (urlResult?.ok) {
          const canonicalSurfaceUrl = extractValidatedChatGptShareUrl(dialog);
          const responseUrlNeedsSurfaceBinding = shareKind === "response" &&
            typeof options.validateShareContext === "function";
          if (responseUrlNeedsSurfaceBinding && !canonicalSurfaceUrl) {
            return fail(
              "share-url",
              "Create-link URL did not belong to the verified response Share surface"
            );
          }
          shareUrl = responseUrlNeedsSurfaceBinding
            ? canonicalSurfaceUrl
            : canonicalSurfaceUrl || urlResult.url;
        } else {
          if (urlResult?.stage === "runtime" || urlResult?.stage === "share-dialog") {
            return fail(urlResult.stage, urlResult.reason || "share flow was aborted", urlResult);
          }
          const copyResult = await resolveShareUrlFromCopySurface(dialog, {
            ...options,
            shareKind,
            getDialogs,
            shareSurfaceBaselineSnapshots: finalSurfaceBaselineSnapshots
          });
          if (!copyResult?.ok) {
            return fail(copyResult?.stage || urlResult?.stage || "share-url", copyResult?.reason || urlResult?.reason || "validated share URL was not found", copyResult || urlResult || {});
          }
          responseCopyClicked = copyResult.copyClicked === true;
          responseCopySignalObserved = copyResult.copySignalObserved === true;
          if (copyResult.surface) dialog = copyResult.surface;
          shareUrl = copyResult.url;
        }
      }
    }
    validatedShareUrl = validateStrictChatGptShareUrl(normalizeChatGptShareUrl(shareUrl));
    if (!validatedShareUrl) return fail("share-url", "share flow returned an invalid ChatGPT share URL");
    artifactDebugLog("validated-share-url", { validated: true, source: shareSource, kind: shareKind, updated: shareUpdatedThisAttempt });

    let dialogClosed = false;
    let closeButton = findCloseShareDialogButton(dialog);
    if (closeButton) {
      if (runtimeGuard?.check) {
        const closeRuntimeStatus = await checkRuntimeGuard(runtimeGuard, "share-dialog-close");
        if (!closeRuntimeStatus?.ok) return fail("runtime", closeRuntimeStatus.error || "runtime unavailable");
      }
      const validateCloseSurface = candidate => validateShareContextBoundary(
        options,
        "share-dialog-close",
        "share-dialog",
        {
          shareKind,
          shareSurface: candidate,
          copyClicked: responseCopyClicked,
          copySignalObserved: responseCopySignalObserved
        }
      );
      let closeContextStatus = validateCloseSurface(dialog);
      if (shareKind === "response" && typeof options.validateShareContext === "function") {
        if (!closeContextStatus.ok && !isResponseShareSurfaceSelectionFailure(closeContextStatus)) {
          return fail(closeContextStatus.stage, closeContextStatus.reason);
        }
        const closeSurfaceOptions = {
          ...options,
          getDialogs,
          beforeSurfaces: finalSurfaceBaselineSnapshots,
          runtimeGuard,
          phase: "share-dialog-close",
          validateSurface: validateCloseSurface,
          copySuccessSurface: responseCopyClicked && responseCopySignalObserved ? dialog : null,
          copyClicked: responseCopyClicked,
          copySignalObserved: responseCopySignalObserved
        };
        const verifiedAutoClosedDuringGuard = closeContextStatus.ok &&
          responseCopyClicked &&
          responseCopySignalObserved &&
          (dialog?.isConnected === false || !shareSurfaceVisibilityDetails(dialog).visible);
        const postGuardSurfaceStatus = verifiedAutoClosedDuringGuard
          ? reacquireFreshFinalShareSurface(dialog, closeSurfaceOptions)
          : null;
        const verifiedClosedWithNoFreshCandidate = verifiedAutoClosedDuringGuard &&
          !postGuardSurfaceStatus?.ok &&
          postGuardSurfaceStatus?.retryable === true &&
          postGuardSurfaceStatus?.candidateCount === 0;
        if (verifiedClosedWithNoFreshCandidate) {
          closeButton = null;
          dialogClosed = true;
        } else {
          const closeSurfaceStatus = await waitForFreshFinalShareSurface(dialog, closeSurfaceOptions);
          if (!closeSurfaceStatus.ok) {
            return fail(closeSurfaceStatus.stage || "share-dialog", closeSurfaceStatus.reason, closeSurfaceStatus);
          }
          dialog = closeSurfaceStatus.surface;
          closeContextStatus = validateCloseSurface(dialog);
          closeButton = findCloseShareDialogButton(dialog);
        }
      }
      if (!closeContextStatus.ok) {
        return fail(closeContextStatus.stage, closeContextStatus.reason);
      }
      if (closeButton) {
        try {
          closeButton.click();
          dialogClosed = true;
        } catch {}
      }
    }
    return {
      ok: true,
      url: validatedShareUrl,
      source: shareSource,
      shareKind,
      shareSource,
      shareCreatedThisAttempt,
      shareUpdatedThisAttempt,
      validatedShareUrl,
      shareInteraction,
      conversationShareActionOccurred,
      dialogClosed
    };
  }

  function filenameFromArtifactText(text, extensions = ["html", "htm"]) {
    const decoded = decodePercentEncodedRuns(text);
    const extensionPattern = extensions.map(escapeRegExp).join("|");
    const m = decoded.match(new RegExp(`([A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af][A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af._ ()-]{0,220}\\.(?:${extensionPattern}))(?=$|[\\s?#'\"<>])`, "i"));
    return m ? m[1].trim() : "";
  }

  function filenamesFromArtifactText(text, extensions = ["html", "htm"]) {
    const names = new Set();
    const extensionPattern = extensions.map(escapeRegExp).join("|");
    const matches = decodePercentEncodedRuns(text).matchAll(new RegExp(`([A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af][A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af._ ()-]{0,220}\\.(?:${extensionPattern}))(?=$|[\\s?#'\"<>])`, "gi"));
    for (const match of matches) {
      names.add(safeArtifactName(match[1].trim(), extensions));
    }
    return Array.from(names);
  }

  function filenameFromText(text) {
    return filenameFromArtifactText(text, ["html", "htm"]);
  }

  function filenamesFromText(text) {
    return filenamesFromArtifactText(text, ["html", "htm"]);
  }

  function artifactNameKey(value) {
    const text = String(value || "");
    try {
      return text.normalize("NFC").toLowerCase();
    } catch {
      return text.toLowerCase();
    }
  }

  function isUsableFileLinkHref(value) {
    const href = String(value || "").trim();
    return !!href && href !== "#" && !/^javascript:/i.test(href);
  }

  function filenamesFromFileLinkText(text, extensions = FILE_DELIVERABLE_EXTENSIONS) {
    const decoded = decodePercentEncodedRuns(text);
    const extensionPattern = extensions.map(escapeRegExp).join("|");
    const tokens = Array.from(decoded.matchAll(new RegExp(`([^\\s'\"<>/\\\\]+\\.(?:${extensionPattern}))(?=$|[\\s?#'\"<>])`, "gi")))
      .map(match => safeArtifactName(match[1], extensions));
    return tokens.length ? Array.from(new Set(tokens)) : filenamesFromArtifactText(decoded, extensions);
  }

  function collectFileLikeLinks(container, extensions = FILE_DELIVERABLE_EXTENSIONS) {
    if (!container?.querySelectorAll) return [];
    const links = Array.from(container.querySelectorAll("a, [role='link']"));
    const entries = [];
    const seen = new Set();

    for (const node of links) {
      if (isInsideUnsupportedRichAppBlock(node)) continue;
      const values = artifactNodeTextValues(node);
      const names = new Set();
      values.forEach(value => {
        filenamesFromFileLinkText(value, extensions).forEach(name => names.add(name));
      });
      const rawHref = String(node.getAttribute?.("href") || "").trim();
      const explicitFileMarker = !!(
        node.getAttribute?.("data-file-name") ||
        node.getAttribute?.("data-filename") ||
        /(?:download|artifact|attachment|file-card)/i.test(String(node.getAttribute?.("data-testid") || ""))
      );
      const expectedDeliverable = !isUsableFileLinkHref(rawHref) ||
        hasDownloadAttribute(node) ||
        /^(?:blob:|data:|sandbox:)/i.test(rawHref) ||
        isKnownChatGptFileHref(rawHref) ||
        explicitFileMarker;
      if (!expectedDeliverable) continue;
      for (const name of names) {
        const safeName = safeArtifactName(name, extensions);
        const key = `${artifactNameKey(safeName)}::${rawHref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          name: safeName,
          href: rawHref,
          unresolved: !isUsableFileLinkHref(rawHref),
          node
        });
      }
    }
    return entries;
  }

  function capturedFileNameSet(attachments = [], downloadedAttachments = [], generatedMarkdown = {}) {
    const names = new Set();
    [...attachments, ...downloadedAttachments].forEach(file => {
      if (file?.name) names.add(artifactNameKey(safeArtifactName(file.name, FILE_DELIVERABLE_EXTENSIONS)));
    });
    if (generatedMarkdown?.markdown && generatedMarkdown?.name) {
      names.add(artifactNameKey(safeArtifactName(generatedMarkdown.name, FILE_DELIVERABLE_EXTENSIONS)));
    }
    const downloadedMarkdown = generatedMarkdown?.downloadedMarkdown;
    if (downloadedMarkdown?.name) {
      names.add(artifactNameKey(safeArtifactName(downloadedMarkdown.name, FILE_DELIVERABLE_EXTENSIONS)));
    }
    return names;
  }

  function collectRichAppBlockCandidates(root, options = {}) {
    const idPrefix = String(options.idPrefix || "rich-app");
    return nodesIncludingRoot(root, '[data-app-block-preview="true"]').map((node, index) => ({
      id: `${idPrefix}-${index}`,
      kind: "app-block",
      source: "data-app-block-preview",
      node
    }));
  }

  const RICH_APP_RUNTIME_HOST_RE = /^app-block-[a-z0-9-]+\.web-sandbox\.oaiusercontent\.com$/i;

  function isStrictRichAppRuntimeIframeUrl(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return false;
    try {
      const parsed = new URL(rawValue);
      const authorityMatch = rawValue.match(/^https:\/\/([^/?#]*)/i);
      const rawAuthority = String(authorityMatch?.[1] || "").toLowerCase();
      const parsedHostname = String(parsed.hostname || "").toLowerCase();
      return parsed.protocol === "https:"
        && !parsed.username
        && !parsed.password
        && !parsed.port
        && rawAuthority === parsedHostname
        && RICH_APP_RUNTIME_HOST_RE.test(parsedHostname);
    } catch {
      return false;
    }
  }

  function resolveProviderNeutralRichAppEvidence(currentAssistantNode) {
    const unresolved = (reason, details = {}) => ({
      ok: false,
      reason,
      block: null,
      iframe: null,
      blockCount: 0,
      iframeCount: 0,
      ...details
    });
    if (!currentAssistantNode || roleAttrForNode(currentAssistantNode) !== "assistant") {
      return unresolved("current node is not an assistant turn");
    }

    const currentTurn = currentAssistantNode.closest?.("[data-testid^='conversation-turn-']") || null;
    if (!currentTurn) return unresolved("current assistant conversation turn was not found");
    const currentMatches = getVerifiedConversationTurnEntries().filter(entry => entry.turn === currentTurn);
    if (currentMatches.length !== 1) {
      return unresolved("current assistant turn is missing or duplicated");
    }
    const currentEntry = currentMatches[0];
    if (currentEntry.ambiguous || currentEntry.role !== "assistant" || currentEntry.node !== currentAssistantNode) {
      return unresolved("current assistant turn is ambiguous");
    }

    const blocks = nodesIncludingRoot(currentAssistantNode, '[data-app-block-preview="true"]');
    if (blocks.length !== 1) {
      return unresolved("rich app block count is not exactly one", { blockCount: blocks.length });
    }
    const block = blocks[0];
    const blockVisibility = elementVisibilityDetails(block);
    if (block.hidden === true || /^true$/i.test(String(block.getAttribute?.("aria-hidden") || "")) || !blockVisibility.visible) {
      return unresolved("rich app block is not connected and visible", { blockCount: 1 });
    }

    const iframes = Array.from(block.querySelectorAll?.("iframe") || []);
    if (iframes.length !== 1) {
      return unresolved("rich app iframe count is not exactly one", {
        blockCount: 1,
        iframeCount: iframes.length
      });
    }
    const iframe = iframes[0];
    const iframeVisibility = elementVisibilityDetails(iframe);
    if (iframe.hidden === true || /^true$/i.test(String(iframe.getAttribute?.("aria-hidden") || "")) || !iframeVisibility.visible) {
      return unresolved("rich app iframe is not connected and visible", {
        blockCount: 1,
        iframeCount: 1
      });
    }

    const iframeUrl = String(iframe.getAttribute?.("src") || "").trim();
    if (!isStrictRichAppRuntimeIframeUrl(iframeUrl)) {
      return unresolved("rich app iframe URL is not an allowed runtime URL", {
        blockCount: 1,
        iframeCount: 1
      });
    }

    return {
      ok: true,
      reason: "",
      block,
      iframe,
      blockCount: 1,
      iframeCount: 1
    };
  }

  function collectRichArtifactCandidatesForStoredNote(currentAssistantNode, { previousQa = null, usePreviousQaForHtml = false } = {}) {
    if (usePreviousQaForHtml && previousQa?.answerNode) {
      return collectRichAppBlockCandidates(previousQa.answerNode, { idPrefix: "stored-a1-rich" });
    }
    return collectRichAppBlockCandidates(currentAssistantNode, { idPrefix: "stored-current-rich" });
  }

  function assessRichArtifactIntegrity({ expected = [], captures = [] } = {}) {
    const completeRepresentations = new Set(["interactive-export", "static-markdown-complete"]);
    const captureByExpectedId = new Map();
    (captures || []).forEach(capture => {
      const expectedId = String(capture?.expectedId || capture?.richArtifactId || capture?.id || "");
      if (!expectedId || !completeRepresentations.has(capture?.representation)) return;
      captureByExpectedId.set(expectedId, capture);
    });
    const items = (expected || []).map((candidate, index) => {
      const id = String(candidate?.id || `rich-app-${index}`);
      const capture = captureByExpectedId.get(id) || null;
      return {
        id,
        kind: candidate?.kind || "app-block",
        source: candidate?.source || "unknown",
        representation: capture?.representation || "none",
        complete: !!capture
      };
    });
    const missingItems = items.filter(item => !item.complete);
    return {
      complete: missingItems.length === 0,
      expectedCount: items.length,
      completeCount: items.length - missingItems.length,
      missingCount: missingItems.length,
      items,
      missingItems
    };
  }

  function combineCaptureIntegrity(fileIntegrity, richIntegrity) {
    const files = fileIntegrity || assessArtifactIntegrity();
    const richArtifacts = richIntegrity || assessRichArtifactIntegrity();
    return {
      complete: !!files.complete && !!richArtifacts.complete,
      files,
      richArtifacts
    };
  }

  function assessArtifactIntegrity({
    fileLinks = [],
    artifactRows = [],
    attachments = [],
    downloadedAttachments = [],
    generatedMarkdown = {},
    failures = []
  } = {}) {
    const capturedNames = capturedFileNameSet(attachments, downloadedAttachments, generatedMarkdown);
    const capturedHtmlNames = Array.from(new Set(
      [...attachments, ...downloadedAttachments]
        .map(file => file?.name || "")
        .filter(name => /\.html?$/i.test(name))
        .map(name => safeArtifactName(name, ["html", "htm"]))
    ));
    const expectedHtmlNames = Array.from(new Set([
      ...fileLinks.map(item => item?.name || ""),
      ...artifactRows.map(item => item?.name || ""),
      ...capturedHtmlNames
    ].filter(name => /\.html?$/i.test(name)).map(name => safeArtifactName(name, ["html", "htm"]))));
    const expectedDeliverableNames = Array.from(new Set([
      ...fileLinks.map(item => item?.name || ""),
      ...artifactRows.map(item => item?.name || "")
    ].filter(Boolean).map(name => safeArtifactName(name, FILE_DELIVERABLE_EXTENSIONS))));
    const missingNames = expectedDeliverableNames.filter(name => !capturedNames.has(artifactNameKey(name)));
    const missingKeys = new Set(missingNames.map(artifactNameKey));
    const unresolvedNames = Array.from(new Set(fileLinks
      .filter(item => item?.unresolved && missingKeys.has(artifactNameKey(item.name)))
      .map(item => item.name)));
    const failureDetails = Array.from(new Set((failures || [])
      .filter(item => !item?.name || missingKeys.has(artifactNameKey(item.name)))
      .map(item => `${item?.name || "unknown file"}: ${item?.reason || "capture failed"}`)));

    return {
      complete: missingNames.length === 0,
      expectedHtmlNames,
      capturedHtmlNames,
      expectedDeliverableNames,
      missingNames,
      unresolvedNames,
      failureDetails
    };
  }

  function formatI18nTemplate(value, fields) {
    return String(value || "").replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => String(fields[key] ?? ""));
  }

  function confirmPartialArtifactSave(report, confirmFn = globalThis.confirm) {
    if (report?.complete) return true;
    const missingNames = report?.missingNames || [];
    const visibleNames = missingNames.slice(0, 12).join(", ") + (missingNames.length > 12 ? ` … (+${missingNames.length - 12})` : "");
    const message = formatI18nTemplate(t("partialArtifactSaveConfirm"), {
      missingCount: missingNames.length,
      expectedHtmlCount: report?.expectedHtmlNames?.length || 0,
      capturedHtmlCount: report?.capturedHtmlNames?.length || 0,
      missingNames: visibleNames || "-"
    });
    return typeof confirmFn === "function" ? confirmFn(message) === true : false;
  }

  function confirmIncompleteCaptureSave(overallIntegrity, confirmFn = globalThis.confirm) {
    if (overallIntegrity?.complete) return true;
    const rich = overallIntegrity?.richArtifacts || assessRichArtifactIntegrity();
    const files = overallIntegrity?.files || assessArtifactIntegrity();
    if (rich.complete) return confirmPartialArtifactSave(files, confirmFn);
    const missingFileNames = (files.missingNames || []).slice(0, 12);
    const extraFileCount = Math.max(0, (files.missingNames || []).length - missingFileNames.length);
    const visibleFileNames = missingFileNames.join(", ") + (extraFileCount ? ` … (+${extraFileCount})` : "");
    const message = formatI18nTemplate(t("partialRichArtifactSaveConfirm"), {
      expectedRichCount: rich.expectedCount || 0,
      completeRichCount: rich.completeCount || 0,
      missingRichCount: rich.missingCount || 0,
      missingFileNames: visibleFileNames || "-"
    });
    return typeof confirmFn === "function" ? confirmFn(message) === true : false;
  }

  function buildMissingRichArtifactWarning(richIntegrity) {
    if (!richIntegrity || richIntegrity.complete) return "";
    const body = formatI18nTemplate(t("missingRichArtifactWarningBody"), {
      expectedRichCount: richIntegrity.expectedCount || 0
    });
    return `> [!warning] ${t("missingRichArtifactWarningTitle")}\n> ${body}`;
  }

  function removeEmptyMarkdownLinkTargets(text) {
    const replacePlainSegment = value => String(value || "").replace(/\[([^\]\n]+)\]\(\s*\)/g, "$1");
    const replaceOutsideInlineCode = line => {
      let result = "";
      let cursor = 0;
      let codeDelimiter = "";
      while (cursor < line.length) {
        if (!codeDelimiter) {
          const nextTick = line.indexOf("`", cursor);
          if (nextTick < 0) {
            result += replacePlainSegment(line.slice(cursor));
            break;
          }
          result += replacePlainSegment(line.slice(cursor, nextTick));
          let end = nextTick + 1;
          while (line[end] === "`") end++;
          codeDelimiter = line.slice(nextTick, end);
          result += codeDelimiter;
          cursor = end;
          continue;
        }
        const closing = line.indexOf(codeDelimiter, cursor);
        if (closing < 0) {
          result += line.slice(cursor);
          break;
        }
        result += line.slice(cursor, closing + codeDelimiter.length);
        cursor = closing + codeDelimiter.length;
        codeDelimiter = "";
      }
      return result;
    };

    let activeFence = null;
    return String(text || "").split(/(\r?\n)/).map(part => {
      if (/^\r?\n$/.test(part)) return part;
      const fence = part.match(/^\s*(`{3,}|~{3,})/);
      if (activeFence) {
        const closingFence = part.match(/^\s*(`{3,}|~{3,})[\t ]*$/);
        if (closingFence && closingFence[1][0] === activeFence.marker && closingFence[1].length >= activeFence.length) {
          activeFence = null;
        }
        return part;
      }
      if (fence) {
        activeFence = { marker: fence[1][0], length: fence[1].length };
        return part;
      }
      return replaceOutsideInlineCode(part);
    }).join("");
  }

  function filenameFromUrl(href) {
    try {
      const url = new URL(href, location.href);
      const path = decodeURIComponent(url.pathname.split("/").pop() || "");
      return filenameFromText(path);
    } catch {
      return filenameFromText(href);
    }
  }

  function safeDownloadName(name) {
    return sanitizeFileName(name || "chatgpt-download.html").replace(/\s+/g, "_") || "chatgpt-download.html";
  }

  function safeArtifactName(name, extensions = ["html", "htm"]) {
    const fallback = extensions.includes("md") ? "chatgpt-generated.md" : "chatgpt-download.html";
    return sanitizeFileName(name || fallback).replace(/\s+/g, "_") || fallback;
  }

  function findNearbyFilename(el) {
    const attrs = [
      el.getAttribute?.("download"),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.textContent
    ];
    for (const attr of attrs) {
      const found = filenameFromText(attr);
      if (found) return found;
    }

    let n = el;
    for (let i = 0; i < 5 && n; i++) {
      const found = filenameFromText(n.innerText || n.textContent || "");
      if (found) return found;
      n = n.parentElement;
    }
    return "";
  }

  function findDownloadHref(el) {
    const direct = el.href || el.getAttribute?.("href");
    if (direct) return new URL(direct, location.href).href;

    const ownAnchor = el.matches?.("a[href]") ? el : el.querySelector?.("a[href]");
    if (ownAnchor?.href) return ownAnchor.href;

    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      const anchor = n.matches?.("a[href]") ? n : n.querySelector?.("a[href]");
      if (anchor?.href) return anchor.href;
      n = n.parentElement;
    }
    return "";
  }

  function isAssociatedArtifactHref(node, href) {
    if (!href) return false;
    if (/^(?:blob:|data:|sandbox:)/i.test(href)) return true;
    if (hasDownloadAttribute(node) || isKnownChatGptFileHref(href)) return true;
    if (node?.matches?.("a[href]")) {
      const ownName = filenameFromArtifactText(artifactNodeTextValues(node).join(" "), ["html", "htm", "md"]);
      const hrefName = filenameFromArtifactText(decodePercentEncodedRuns(href), ["html", "htm", "md"]);
      return !!ownName && !!hrefName && safeArtifactName(ownName, ["html", "htm", "md"]) === safeArtifactName(hrefName, ["html", "htm", "md"]);
    }
    return false;
  }

  function hasDownloadAttribute(el) {
    return !!(el?.hasAttribute?.("download") || el?.querySelector?.("[download]"));
  }

  function isBlobOrSandboxHref(href) {
    return /^(blob:|sandbox:)/i.test(String(href || ""));
  }

  function hrefScheme(href) {
    const value = String(href || "");
    if (!value) return "empty";
    const match = value.match(/^([a-z][a-z0-9+.-]*):/i);
    return match ? match[1].toLowerCase() : "relative";
  }

  function isFetchableDownloadHref(href) {
    if (!href) return false;
    const scheme = hrefScheme(href);
    if (scheme === "blob" || scheme === "data") return true;
    if (scheme !== "http" && scheme !== "https" && scheme !== "relative") return false;
    try {
      return new URL(href, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  function isKnownChatGptFileHref(href) {
    try {
      const url = new URL(href, location.href);
      if (/(?:^|\.)oaiusercontent\.com$/i.test(url.hostname)) return true;
      return url.origin === location.origin && /\/(?:backend-api\/)?files?\/|\/download\//i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isPlainExternalAnchor(node, href) {
    if (!node?.matches?.("a[href]")) return false;
    if (hasDownloadAttribute(node) || isBlobOrSandboxHref(href)) return false;
    if (isKnownChatGptFileHref(href)) return false;
    try {
      const url = new URL(href, location.href);
      return /^https?:$/i.test(url.protocol) && url.origin !== location.origin;
    } catch {
      return false;
    }
  }

  function hasNearbyArtifactViewer(node) {
    const messageRoot = closestArtifactContainer(node) ||
      node?.closest?.('[data-message-author-role="assistant"]') ||
      node?.closest?.("article") ||
      null;
    if (!messageRoot?.querySelectorAll) return false;

    const buttons = Array.from(messageRoot.querySelectorAll("button"));
    const hasCodeToggle = buttons.some(button => /^(?:code|coding|코드|코딩)$/i.test(controlLabel(button)));
    const hasPreviewToggle = buttons.some(isArtifactPreviewToggle);
    const hasViewer = !!messageRoot.querySelector?.("iframe, .cm-editor, pre.cm-content, [data-testid*='artifact' i]");
    return hasCodeToggle && hasPreviewToggle && hasViewer;
  }

  function isLikelyInteractiveHtmlFileCard(node, href = "") {
    if (!node || node.classList?.contains("gpt2obs-btn")) return false;

    const rawOwnText = [
      node.getAttribute?.("download") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("data-file-name") || "",
      node.getAttribute?.("data-filename") || "",
      node.innerText || node.textContent || ""
    ].join(" ");
    const decodedOwnText = decodePercentEncodedRuns(rawOwnText);
    const ownFilename = filenameFromText(decodedOwnText) || filenameFromUrl(href);
    if (!ownFilename || !/\.html?$/i.test(ownFilename)) return false;

    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    const isButtonLike = tagName === "button" || role === "button";
    const isAnchor = tagName === "a" || node.matches?.("a[href]");
    const explicitFileMarker = /download|다운로드|artifact|attachment|첨부|(?:^|[\s_-])file(?:[\s_-]|$)|파일/i.test(decodedOwnText);
    const artifactStats = /\d[\d,]*\s*(?:chars?|characters?|문자)\s*[•·]\s*\d[\d,]*\s*(?:words?|단어)/i.test(decodedOwnText);
    const encodedFilename = /(?:%[0-9a-f]{2}){2,}[^\s]*\.html?/i.test(rawOwnText);
    const fileHref = /^(?:blob:|sandbox:|data:)/i.test(href) || isKnownChatGptFileHref(href) || /\/(?:backend-api\/)?files?\/|\/download\//i.test(href);
    const artifactViewerContext = isButtonLike && hasNearbyArtifactViewer(node);

    if (isButtonLike) {
      return explicitFileMarker || artifactStats || encodedFilename || fileHref || artifactViewerContext;
    }
    if (isAnchor && !isPlainExternalAnchor(node, href)) {
      return explicitFileMarker || artifactStats || encodedFilename || fileHref || hasDownloadAttribute(node);
    }
    return explicitFileMarker && (artifactStats || encodedFilename || fileHref);
  }

  function canClickDownloadCandidate(candidate) {
    const node = candidate?.node;
    if (!node) return false;
    if (hasDownloadAttribute(node) || isBlobOrSandboxHref(candidate.href)) return true;
    if (isLikelyInteractiveHtmlFileCard(node, candidate.href)) return true;
    if (isPlainExternalAnchor(node, candidate.href)) return false;
    return !node.matches?.("a[href]");
  }

  function downloadControlLabels(node) {
    if (!node) return [];
    return [
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.innerText || node.textContent || ""
    ]
      .map(value => decodePercentEncodedRuns(value).replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function isExactDownloadControl(node) {
    const labels = downloadControlLabels(node);
    if (labels.some(label => /^(?:download|download file|file download|다운로드|파일 다운로드)$/i.test(label))) {
      return true;
    }

    const testId = String(node?.getAttribute?.("data-testid") || "").trim();
    return /^(?:download|download-button|file-download|file-download-button|download-file|download-file-button)$/i.test(testId);
  }

  function artifactNodeTextValues(node) {
    return [
      node?.getAttribute?.("download") || "",
      node?.getAttribute?.("aria-label") || "",
      node?.getAttribute?.("title") || "",
      node?.getAttribute?.("data-file-name") || "",
      node?.getAttribute?.("data-filename") || "",
      node?.innerText || node?.textContent || ""
    ].map(value => decodePercentEncodedRuns(String(value || "")));
  }

  function elementVisibilityDetails(node) {
    if (!node) {
      return {
        connected: false,
        rectKnown: false,
        rectVisible: false,
        display: "",
        visibility: "",
        visible: false
      };
    }

    const connected = node.isConnected !== false;
    let display = "";
    let visibility = "";
    try {
      const view = node.ownerDocument?.defaultView || globalThis.window;
      const computed = view?.getComputedStyle?.(node);
      display = String(computed?.display || node.style?.display || "").toLowerCase();
      visibility = String(computed?.visibility || node.style?.visibility || "").toLowerCase();
    } catch {
      display = String(node.style?.display || "").toLowerCase();
      visibility = String(node.style?.visibility || "").toLowerCase();
    }

    let rectKnown = false;
    let rectVisible = true;
    try {
      if (typeof node.getBoundingClientRect === "function") {
        rectKnown = true;
        const rect = node.getBoundingClientRect();
        rectVisible = !!rect && Number(rect.width) > 0 && Number(rect.height) > 0;
      }
    } catch {
      rectKnown = false;
      rectVisible = true;
    }

    const styleVisible = display !== "none" && visibility !== "hidden" && visibility !== "collapse";
    return {
      connected,
      rectKnown,
      rectVisible,
      display,
      visibility,
      visible: connected && styleVisible && rectVisible
    };
  }

  function isVisibleEnabledControl(node) {
    if (!node) return false;
    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    if (tagName !== "button" && role !== "button") return false;
    if (node.disabled === true || node.hidden === true) return false;
    if (/^true$/i.test(String(node.getAttribute?.("aria-hidden") || ""))) return false;
    if (/^(?:true|disabled)$/i.test(String(node.getAttribute?.("aria-disabled") || ""))) return false;
    if (/^(?:true|disabled)$/i.test(String(node.getAttribute?.("data-disabled") || ""))) return false;
    return elementVisibilityDetails(node).visible;
  }

  function isVisibleEnabledShareAction(node) {
    if (!node) return false;
    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    if (tagName !== "button" && role !== "button" && role !== "menuitem") return false;
    if (node.disabled === true || node.hidden === true) return false;
    if (/^true$/i.test(String(node.getAttribute?.("aria-hidden") || ""))) return false;
    if (/^(?:true|disabled)$/i.test(String(node.getAttribute?.("aria-disabled") || ""))) return false;
    if (/^(?:true|disabled)$/i.test(String(node.getAttribute?.("data-disabled") || ""))) return false;
    return elementVisibilityDetails(node).visible;
  }

  function shareElementDiagnostic(node, turnRoot = null) {
    if (!node) return null;
    let rect = null;
    try {
      const value = node.getBoundingClientRect?.();
      if (value) {
        rect = {
          x: Math.round(Number(value.x) || 0),
          y: Math.round(Number(value.y) || 0),
          width: Math.round(Number(value.width) || 0),
          height: Math.round(Number(value.height) || 0)
        };
      }
    } catch {}
    const turn = node.closest?.("[data-testid^='conversation-turn-']") || null;
    const parent = node.parentElement || null;
    return {
      tag: String(node.tagName || "").toUpperCase(),
      role: String(node.getAttribute?.("role") || ""),
      ariaLabel: String(node.getAttribute?.("aria-label") || "").slice(0, 120),
      title: String(node.getAttribute?.("title") || "").slice(0, 120),
      testId: String(node.getAttribute?.("data-testid") || "").slice(0, 120),
      dataState: String(node.getAttribute?.("data-state") || ""),
      ariaExpanded: String(node.getAttribute?.("aria-expanded") || ""),
      disabled: node.disabled === true || /^(?:true|disabled)$/i.test(String(node.getAttribute?.("aria-disabled") || "")),
      connected: node.isConnected !== false,
      visible: elementVisibilityDetails(node).visible,
      rect,
      turnTestId: String(turn?.getAttribute?.("data-testid") || "").slice(0, 120),
      insideRequestedTurn: !!turnRoot && (turn === turnRoot || turnRoot.contains?.(node)),
      parentRole: String(parent?.getAttribute?.("role") || ""),
      parentAriaLabel: String(parent?.getAttribute?.("aria-label") || "").slice(0, 120)
    };
  }

  function shareSurfaceDiagnostic(surface) {
    if (!surface) return null;
    const controls = nodesIncludingRoot(surface, "button, [role='button']");
    let bodyDepth = -1;
    try {
      let current = surface;
      let depth = 0;
      while (current && current !== document.body) {
        depth += 1;
        current = current.parentElement;
      }
      if (current === document.body) bodyDepth = depth;
    } catch {}
    return {
      ...shareElementDiagnostic(surface),
      bodyDepth,
      controlCount: controls.length,
      inputCount: nodesIncludingRoot(surface, "input, textarea").length,
      linkCount: nodesIncludingRoot(surface, "a[href]").length,
      copyLinkControlCount: controls.filter(isCopyShareLinkControl).length,
      updateLinkControlCount: controls.filter(isUpdateShareLinkControl).length,
      createLinkControlCount: controls.filter(node => shareDialogControlScore(node, "create") >= 0).length,
      hasValidatedShareUrl: !!extractValidatedChatGptShareUrl(surface)
    };
  }

  function responseShareControlScore(node) {
    if (!isVisibleEnabledControl(node) || node.classList?.contains("gpt2obs-btn")) return -1;
    const labels = [
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      controlLabel(node)
    ].map(value => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const marker = labels.join(" ");
    if (!/(?:\bshare\b|공유)/i.test(marker)) return -1;

    let score = 20;
    const testId = String(node.getAttribute?.("data-testid") || "");
    const aria = String(node.getAttribute?.("aria-label") || "");
    const title = String(node.getAttribute?.("title") || "");
    if (/share/i.test(testId)) score += 100;
    if (/^(?:share|공유)$/i.test(aria.trim()) || /^(?:share|공유)$/i.test(title.trim())) score += 70;
    if (/^(?:share|공유)$/i.test(controlLabel(node))) score += 35;

    let ancestor = node.parentElement;
    for (let depth = 0; depth < 5 && ancestor; depth++, ancestor = ancestor.parentElement) {
      const regionMarker = [
        ancestor.getAttribute?.("role") || "",
        ancestor.getAttribute?.("data-testid") || "",
        ancestor.getAttribute?.("aria-label") || "",
        ancestor.getAttribute?.("class") || ancestor.className || ""
      ].join(" ");
      if (/(?:toolbar|footer|action)/i.test(regionMarker)) {
        score += 30;
        break;
      }
    }
    return score;
  }

  function isResponseActionToolbarControl(node, turnRoot) {
    let ancestor = node?.parentElement || null;
    for (let depth = 0; depth < 7 && ancestor; depth++, ancestor = ancestor.parentElement) {
      if (ancestor === turnRoot?.parentElement) break;
      const role = String(ancestor.getAttribute?.("role") || "").toLowerCase();
      const marker = [
        ancestor.getAttribute?.("data-testid") || "",
        ancestor.getAttribute?.("aria-label") || "",
        ancestor.getAttribute?.("class") || ancestor.className || ""
      ].join(" ").replace(/\s+/g, " ").trim();
      if (role === "group" && /(?:response\s*actions?|응답\s*작업|assistant\s*actions?)/i.test(marker)) return true;
      if (role === "toolbar" && /(?:response|assistant|응답).*(?:toolbar|actions?|작업)|(?:toolbar|actions?|작업).*(?:response|assistant|응답)/i.test(marker)) return true;
      if (/(?:response|assistant|응답).*(?:toolbar|actions?|작업)|(?:toolbar|actions?|작업).*(?:response|assistant|응답)/i.test(marker)) return true;
      if (ancestor === turnRoot) break;
    }
    return false;
  }

  function resolveResponseShareTrigger(currentAssistantNode) {
    const root = currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']") || currentAssistantNode;
    if (!root?.querySelectorAll) {
      return {
        status: "missing",
        control: null,
        candidateCount: 0,
        reason: "current assistant response action toolbar was not found"
      };
    }
    const controls = nodesIncludingRoot(root, "button, [role='button']")
      .filter(node => !node.classList?.contains("gpt2obs-btn"))
      .filter(node => isResponseActionToolbarControl(node, root));
    const scored = controls
      .map((node, index) => ({ node, index, score: responseShareControlScore(node) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    artifactDebugLog("share-trigger-candidates", {
      count: scored.length,
      candidates: scored.slice(0, 8).map(item => ({ score: item.score, ...shareElementDiagnostic(item.node, root) }))
    });
    if (!scored.length) {
      return {
        status: "missing",
        control: null,
        candidateCount: 0,
        reason: "current assistant response share button was not found"
      };
    }
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      return {
        status: "ambiguous",
        control: null,
        candidateCount: scored.length,
        reason: "multiple current assistant response share buttons were equally eligible",
        candidates: scored.map(item => item.node)
      };
    }
    return {
      status: "found",
      control: scored[0].node,
      candidateCount: scored.length,
      reason: "",
      candidates: scored.map(item => item.node)
    };
  }

  function resolveConversationShareTrigger(root = document) {
    const candidates = nodesIncludingRoot(root, "[data-testid='share-chat-button']")
      .filter(node => node?.isConnected !== false)
      .filter(node => !node?.closest?.("[data-testid^='conversation-turn-']"))
      .filter(node => String(node?.getAttribute?.("data-testid") || "") !== "share-prompt-link-turn-action-button")
      .filter(node => !node?.closest?.('[data-app-block-preview="true"]'))
      .filter(node => {
        const marker = [
          node?.getAttribute?.("aria-label") || "",
          node?.getAttribute?.("title") || "",
          node?.getAttribute?.("data-testid") || "",
          node?.className || ""
        ].join(" ").replace(/\s+/g, " ").trim();
        return !/(?:share[\s_-]*prompt|prompt[\s_-]*share)/i.test(marker);
      })
      .filter(isVisibleEnabledControl);
    if (!candidates.length) {
      return {
        status: "missing",
        control: null,
        candidateCount: 0,
        reason: "conversation share button was not found"
      };
    }
    if (candidates.length !== 1) {
      return {
        status: "ambiguous",
        control: null,
        candidateCount: candidates.length,
        reason: "multiple conversation share buttons were found",
        candidates
      };
    }
    return {
      status: "found",
      control: candidates[0],
      candidateCount: 1,
      reason: "",
      candidates
    };
  }

  function resolveVisualizeShareTriggerPlan(currentAssistantNode, { root = document } = {}) {
    const response = resolveResponseShareTrigger(currentAssistantNode);
    if (response.status === "found") {
      return {
        status: "found",
        kind: "response",
        response,
        conversation: null,
        control: response.control,
        reason: ""
      };
    }
    if (response.status === "ambiguous") {
      return {
        status: "blocked",
        kind: "response",
        response,
        conversation: null,
        control: null,
        reason: response.reason
      };
    }
    const conversation = resolveConversationShareTrigger(root);
    if (conversation.status === "found") {
      return {
        status: "found",
        kind: "conversation",
        response,
        conversation,
        control: conversation.control,
        reason: ""
      };
    }
    return {
      status: "unavailable",
      kind: "none",
      response,
      conversation,
      control: null,
      reason: "response-specific share is missing and conversation share is unavailable"
    };
  }

  function findResponseShareButton(currentAssistantNode) {
    const resolution = resolveResponseShareTrigger(currentAssistantNode);
    if (resolution.status !== "found") return null;
    return resolution.control;
  }

  function artifactRowPreferenceScore(item) {
    if (!item) return -1;
    const rowState = elementVisibilityDetails(item.row);
    const openState = elementVisibilityDetails(item.openButton);
    const downloadState = elementVisibilityDetails(item.downloadButton);
    let score = 0;
    if (rowState.visible) score += 100;
    if (rowState.connected) score += 20;
    if (openState.visible) score += 8;
    if (downloadState.visible) score += 6;
    if (item.href) score += 2;
    return score;
  }

  function choosePreferredArtifactRow(rows) {
    const list = Array.from(rows || []);
    if (!list.length) return null;
    return list
      .map((row, index) => ({ row, index, score: artifactRowPreferenceScore(row) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0].row;
  }

  function artifactControlDebugSummary(node) {
    if (!node) return null;
    const href = findDownloadHref(node);
    return {
      tag: String(node.tagName || "").toUpperCase(),
      ariaLabel: String(node.getAttribute?.("aria-label") || "").slice(0, 240),
      title: String(node.getAttribute?.("title") || "").slice(0, 240),
      testId: String(node.getAttribute?.("data-testid") || "").slice(0, 160),
      hrefScheme: hrefScheme(href),
      exactDownload: isExactDownloadControl(node),
      hasDownloadAttribute: hasDownloadAttribute(node),
      visibility: elementVisibilityDetails(node)
    };
  }

  function artifactRowDebugSummary(item) {
    const rowNode = item?.row || null;
    const turn = rowNode?.closest?.("[data-testid^='conversation-turn-']") || null;
    const controls = Array.from(rowNode?.querySelectorAll?.("button, a[href], [role='button']") || []);
    return {
      name: item?.name || "",
      rowClass: String(rowNode?.className || rowNode?.getAttribute?.("class") || "").slice(0, 300),
      turnTestId: String(turn?.getAttribute?.("data-testid") || "").slice(0, 160),
      visibility: elementVisibilityDetails(rowNode),
      controls: controls.slice(0, 20).map(artifactControlDebugSummary),
      selectedOpen: artifactControlDebugSummary(item?.openButton),
      selectedDownload: artifactControlDebugSummary(item?.downloadButton)
    };
  }

  function logArtifactRowResolution(phase, canonicalName, rows, selected) {
    artifactDebugLog("Markdown artifact row resolution", {
      phase,
      canonicalName,
      matchingRowCount: rows.length,
      selectedVisible: !!selected && elementVisibilityDetails(selected.row).visible,
      selectedConnected: !!selected && elementVisibilityDetails(selected.row).connected,
      rows: rows.map(artifactRowDebugSummary)
    });
  }

  function resolveArtifactFileRow(container, name, extensions = ["html", "htm"], options = {}) {
    const canonicalName = safeArtifactName(name, extensions);
    const collector = options.collectRows || collectArtifactFileRows;
    const rows = Array.from(collector(container, extensions) || []);
    const matches = rows.filter(item => safeArtifactName(item?.name, extensions) === canonicalName);
    const selected = choosePreferredArtifactRow(matches);
    if (options.debugPhase) logArtifactRowResolution(options.debugPhase, canonicalName, matches, selected);
    return selected;
  }

  function filenameFromArtifactNode(node, extensions) {
    for (const value of artifactNodeTextValues(node)) {
      const name = filenameFromArtifactText(value, extensions);
      if (name) return safeArtifactName(name, extensions);
    }
    return "";
  }

  function findArtifactFileRow(node, container, extensions) {
    let current = node;
    for (let depth = 0; depth < 7 && current; depth++, current = current.parentElement) {
      if (current === container) break;
      const controls = Array.from(current.querySelectorAll?.("button, a[href], [role='button']") || []);
      if (node && !controls.includes(node)) controls.unshift(node);
      const names = new Set(controls.map(control => filenameFromArtifactNode(control, extensions)).filter(Boolean));
      const className = String(current.className || current.getAttribute?.("class") || "");
      const rowMarker = /(?:^|[\s/:-])(?:artifact|file)(?:[\s/:-]|$)/i.test(className) || /artifact-row/i.test(className);
      const hasDownloadControl = controls.some(control => isExactDownloadControl(control) || hasDownloadAttribute(control));
      const hasFileHref = controls.some(control => isKnownChatGptFileHref(findDownloadHref(control)));
      if (names.size === 1 && (hasDownloadControl || hasFileHref || rowMarker)) {
        return current;
      }
    }

    const ownName = filenameFromArtifactNode(node, extensions);
    const ownHref = findDownloadHref(node);
    if (ownName && (hasDownloadAttribute(node) || isKnownChatGptFileHref(ownHref))) return node;
    return null;
  }

  function collectArtifactFileRows(container, extensions = ["html", "htm"]) {
    if (!container?.querySelectorAll) return [];
    const nodes = Array.from(container.querySelectorAll([
      "button",
      "a[href]",
      "a[download]",
      "[role='button']",
      "[data-file-name]",
      "[data-filename]"
    ].join(","))).filter(node => !isInsideUnsupportedRichAppBlock(node));
    const rows = [];

    for (const node of nodes) {
      const ownName = filenameFromArtifactNode(node, extensions);
      if (!ownName) continue;
      const detectedRow = findArtifactFileRow(node, container, extensions);
      if (!detectedRow) continue;
      const nearestArtifactRow = node.closest?.("[class*='artifact-row']") || detectedRow;
      const row = nearestArtifactRow || detectedRow;
      const controls = Array.from(row.querySelectorAll?.("button, a[href], [role='button']") || []);
      if (!controls.includes(node)) controls.unshift(node);
      const names = Array.from(new Set(controls.map(control => filenameFromArtifactNode(control, extensions)).filter(Boolean)));
      const name = names.length === 1 ? names[0] : ownName;
      const openButton = controls.find(control => filenameFromArtifactNode(control, extensions) === name && !isExactDownloadControl(control)) || node;
      const downloadButton = controls.find(isExactDownloadControl) || controls.find(hasDownloadAttribute) || null;
      const hrefEntry = [downloadButton, openButton, ...controls]
        .filter(Boolean)
        .map(control => ({ control, href: findDownloadHref(control) }))
        .find(item => item.href && (
          hasDownloadAttribute(item.control) ||
          /^(?:blob:|data:|sandbox:)/i.test(item.href) ||
          isKnownChatGptFileHref(item.href)
        ));
      const href = hrefEntry?.href || "";
      if (rows.some(item => item.row === row && item.name === name)) continue;
      rows.push({ name, row, openButton, downloadButton, href });
    }
    return rows;
  }

  function isCollapsedArtifactListControl(button) {
    const label = controlLabel(button).replace(/\s+/g, " ").trim();
    return /^\d+\s*개\s*더\s*보기$/i.test(label) || /^(?:show\s+)?\d+\s+more$/i.test(label);
  }

  async function revealCollapsedGeneratedArtifacts(container) {
    if (!container?.querySelectorAll) return 0;
    let clicked = 0;
    for (let pass = 0; pass < 4; pass++) {
      const controls = Array.from(container.querySelectorAll("button"))
        .filter(control => !isInsideUnsupportedRichAppBlock(control))
        .filter(isCollapsedArtifactListControl);
      if (!controls.length) break;
      controls.forEach(control => {
        try {
          control.click();
          clicked++;
        } catch {}
      });
      await sleep(150);
    }
    return clicked;
  }

  function markdownArtifactNameScore(name) {
    const value = decodePercentEncodedRuns(name).toLowerCase();
    let score = 0;
    if (/상세/.test(value)) score += 8;
    if (/요약/.test(value)) score += 7;
    if (/detailed/.test(value)) score += 8;
    if (/summary/.test(value)) score += 7;
    if (/study[-_ ]?guide/.test(value)) score += 6;
    return score;
  }

  function selectGeneratedMarkdownArtifact(rows) {
    const byName = new Map();
    Array.from(rows || []).forEach(row => {
      const name = safeArtifactName(row?.name, ["md"]);
      if (!name) return;
      const group = byName.get(name) || [];
      if (!group.some(item => item.row === row.row)) group.push({ ...row, name });
      byName.set(name, group);
    });

    const uniqueNames = Array.from(byName.entries()).map(([name, group]) => {
      const preferred = choosePreferredArtifactRow(group);
      return preferred ? { ...preferred, name } : null;
    }).filter(Boolean);
    if (uniqueNames.length === 0) return { row: null, warning: "" };
    if (uniqueNames.length === 1) return { row: uniqueNames[0], warning: "" };

    const ranked = uniqueNames.map(row => ({ row, score: markdownArtifactNameScore(row.name) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0].score > 0 && ranked[0].score > ranked[1].score) {
      return { row: ranked[0].row, warning: "" };
    }
    return {
      row: null,
      warning: `Markdown artifact mapping is ambiguous: ${uniqueNames.map(item => item.name).join(", ")}`
    };
  }

  async function readTextArtifactHref(href, maxChars) {
    if (!href || !isFetchableDownloadHref(href)) {
      throw new Error(`artifact href is not page-fetchable: ${hrefScheme(href)}`);
    }
    const response = await fetch(href, { credentials: "include" });
    if (!response.ok) throw new Error(`artifact fetch failed: ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error("artifact file is empty");
    if (text.length > maxChars) throw new Error(`artifact exceeds ${maxChars} characters`);
    return text.replace(/\r\n?/g, "\n");
  }

  function generatedMarkdownRegionRoot(node) {
    if (!node) return null;
    const canonicalSelector = "[data-testid='screen-threadFlyOut']";
    const flyoutSelector = `${canonicalSelector}, [data-testid*='flyout' i]`;

    // ChatGPT currently nests the real screen-threadFlyOut inside a broader
    // stage-thread-flyout wrapper. Always collapse both DOM views to the
    // inner screen so one visible viewer cannot become two mapping regions.
    if (node.matches?.(canonicalSelector)) return node;
    const closestCanonical = node.closest?.(canonicalSelector);
    if (closestCanonical) return closestCanonical;

    const nestedCanonical = Array.from(node.querySelectorAll?.(canonicalSelector) || []);
    const visibleNested = nestedCanonical.filter(candidate => elementVisibilityDetails(candidate).visible);
    if (visibleNested.length === 1) return visibleNested[0];
    if (nestedCanonical.length === 1) return nestedCanonical[0];

    if (node.matches?.(flyoutSelector)) return node;
    return node.closest?.(flyoutSelector) || node;
  }

  function collectGeneratedMarkdownRegions(options = {}) {
    const rawRegions = options.nodes || Array.from(document.querySelectorAll?.([
      "[role='region'][aria-label]",
      "[data-testid='screen-threadFlyOut']",
      "[data-testid*='flyout' i]"
    ].join(",")) || []);
    const regions = [];
    const seen = new Set();
    for (const rawRegion of rawRegions) {
      const region = generatedMarkdownRegionRoot(rawRegion);
      if (!region || seen.has(region)) continue;
      seen.add(region);
      if (options.includeHidden !== true && !elementVisibilityDetails(region).visible) continue;
      regions.push(region);
    }
    return regions;
  }

  function captureGeneratedMarkdownRegionSnapshot(options = {}) {
    return new Set(collectGeneratedMarkdownRegions(options));
  }

  function generatedMarkdownRegionHasName(region, name) {
    const safeName = safeArtifactName(name, ["md"]);
    const labels = artifactNodeTextValues(region).join(" ");
    return safeArtifactName(filenameFromArtifactText(labels, ["md"]), ["md"]) === safeName;
  }

  function markdownCandidatesFromGeneratedRegion(region) {
    if (!region?.querySelectorAll) return [];
    const selectors = [
      ".ProseMirror.markdown",
      ".markdown.prose",
      "[class~='markdown'][class~='prose']",
      "[data-testid*='artifact' i] .markdown",
      ".ProseMirror"
    ];
    const nodes = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const node of Array.from(region.querySelectorAll(selector))) {
        if (seen.has(node)) continue;
        seen.add(node);
        if (!elementVisibilityDetails(node).visible) continue;
        nodes.push(node);
      }
    }

    const candidates = [];
    for (const node of nodes) {
      const clone = node.cloneNode(true);
      removePreviousQaMarkdownChrome(clone);
      const markdown = htmlToMarkdown(clone.innerHTML || "");
      if (markdown && markdown.length >= 20 && markdown.length <= MAX_GENERATED_MARKDOWN_CHARS) {
        candidates.push({
          node,
          markdown: markdown.replace(/\r\n?/g, "\n").trim()
        });
      }
    }
    return candidates.sort((a, b) => b.markdown.length - a.markdown.length);
  }

  function generatedMarkdownRegionContains(ancestor, descendant) {
    if (!ancestor || !descendant || ancestor === descendant) return ancestor === descendant;
    try {
      return typeof ancestor.contains === "function" && ancestor.contains(descendant);
    } catch {
      return false;
    }
  }

  function generatedMarkdownRegionsEquivalent(left, right, readCandidates = markdownCandidatesFromGeneratedRegion) {
    if (!left || !right) return false;
    if (left === right) return true;
    const nested = generatedMarkdownRegionContains(left, right) || generatedMarkdownRegionContains(right, left);
    if (!nested) return false;

    const leftCandidates = Array.from(readCandidates(left) || []);
    const rightCandidates = Array.from(readCandidates(right) || []);
    const leftNodes = new Set(leftCandidates.map(candidate => candidate?.node).filter(Boolean));
    if (rightCandidates.some(candidate => candidate?.node && leftNodes.has(candidate.node))) return true;

    const normalize = value => String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const leftBodies = new Set(leftCandidates.map(candidate => normalize(candidate?.markdown)).filter(Boolean));
    return rightCandidates.some(candidate => leftBodies.has(normalize(candidate?.markdown)));
  }

  function preferredGeneratedMarkdownRegion(left, right) {
    const isCanonical = region => region?.matches?.("[data-testid='screen-threadFlyOut']") === true;
    if (isCanonical(left) !== isCanonical(right)) return isCanonical(left) ? left : right;
    if (generatedMarkdownRegionContains(left, right)) return right;
    if (generatedMarkdownRegionContains(right, left)) return left;
    return left;
  }

  function collapseEquivalentGeneratedMarkdownRegions(regions, readCandidates = markdownCandidatesFromGeneratedRegion) {
    const collapsed = [];
    for (const region of Array.from(regions || [])) {
      if (!region) continue;
      const index = collapsed.findIndex(existing => generatedMarkdownRegionsEquivalent(existing, region, readCandidates));
      if (index < 0) {
        collapsed.push(region);
      } else {
        collapsed[index] = preferredGeneratedMarkdownRegion(collapsed[index], region);
      }
    }
    return collapsed;
  }

  function findGeneratedMarkdownRegion(name) {
    return collectGeneratedMarkdownRegions().find(region => generatedMarkdownRegionHasName(region, name)) || null;
  }

  function markdownFromGeneratedRegion(region) {
    return markdownCandidatesFromGeneratedRegion(region)[0]?.markdown || "";
  }

  function findGeneratedMarkdownRegionCandidate(name, options = {}) {
    const readCandidates = options.readCandidates || markdownCandidatesFromGeneratedRegion;
    const rawRegions = options.regions || collectGeneratedMarkdownRegions(options.regionOptions || {});
    const regions = collapseEquivalentGeneratedMarkdownRegions(rawRegions, readCandidates);
    const exactRegions = regions.filter(region => generatedMarkdownRegionHasName(region, name));

    if (exactRegions.length === 1) {
      const readable = Array.from(readCandidates(exactRegions[0]) || []);
      if (readable.length >= 1) {
        return {
          region: exactRegions[0],
          markdown: readable[0].markdown || "",
          ambiguous: false,
          matchKind: readable.length === 1 ? "exact-name" : "exact-name-best-readable-node",
          regionCount: regions.length,
          newRegionCount: 0,
          readableNodeCount: readable.length
        };
      }
      return {
        region: exactRegions[0],
        markdown: "",
        ambiguous: false,
        matchKind: "exact-name-pending",
        regionCount: regions.length,
        newRegionCount: 0,
        readableNodeCount: 0
      };
    }

    if (exactRegions.length > 1) {
      return {
        region: null,
        markdown: "",
        ambiguous: true,
        matchKind: "multiple-exact-name-regions",
        regionCount: regions.length,
        newRegionCount: 0,
        readableNodeCount: exactRegions.reduce((count, region) => count + Array.from(readCandidates(region) || []).length, 0)
      };
    }

    const hasBeforeSnapshot = options.beforeRegions instanceof Set || Array.isArray(options.beforeRegions);
    if (!hasBeforeSnapshot) {
      return {
        region: null,
        markdown: "",
        ambiguous: false,
        matchKind: "no-exact-name",
        regionCount: regions.length,
        newRegionCount: 0,
        readableNodeCount: 0
      };
    }

    const beforeRegions = options.beforeRegions instanceof Set
      ? options.beforeRegions
      : new Set(options.beforeRegions || []);
    const newRegions = regions.filter(region => !beforeRegions.has(region));
    if (newRegions.length === 1) {
      const readable = Array.from(readCandidates(newRegions[0]) || []);
      if (readable.length === 1) {
        return {
          region: newRegions[0],
          markdown: readable[0].markdown || "",
          ambiguous: false,
          matchKind: "single-new-flyout",
          regionCount: regions.length,
          newRegionCount: 1,
          readableNodeCount: 1
        };
      }
      if (readable.length > 1) {
        return {
          region: null,
          markdown: "",
          ambiguous: true,
          matchKind: "single-new-flyout-multiple-readable-nodes",
          regionCount: regions.length,
          newRegionCount: 1,
          readableNodeCount: readable.length
        };
      }
      return {
        region: newRegions[0],
        markdown: "",
        ambiguous: false,
        matchKind: "single-new-flyout-pending",
        regionCount: regions.length,
        newRegionCount: 1,
        readableNodeCount: 0
      };
    }

    if (newRegions.length > 1) {
      return {
        region: null,
        markdown: "",
        ambiguous: true,
        matchKind: "multiple-new-flyouts",
        regionCount: regions.length,
        newRegionCount: newRegions.length,
        readableNodeCount: newRegions.reduce((count, region) => count + Array.from(readCandidates(region) || []).length, 0)
      };
    }

    return {
      region: null,
      markdown: "",
      ambiguous: false,
      matchKind: "no-new-flyout",
      regionCount: regions.length,
      newRegionCount: 0,
      readableNodeCount: 0
    };
  }

  async function waitForGeneratedMarkdownRegion(name, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : GENERATED_MARKDOWN_VIEWER_TIMEOUT_MS;
    const pollMs = Number.isFinite(options.pollMs)
      ? Math.max(1, options.pollMs)
      : GENERATED_MARKDOWN_VIEWER_POLL_MS;
    const ambiguityStabilityMs = Number.isFinite(options.ambiguityStabilityMs)
      ? Math.max(0, options.ambiguityStabilityMs)
      : GENERATED_MARKDOWN_AMBIGUITY_STABILITY_MS;
    const runtimeCheckIntervalMs = Number.isFinite(options.runtimeCheckIntervalMs)
      ? Math.max(1, options.runtimeCheckIntervalMs)
      : RUNTIME_POLL_INTERVAL_MS;
    const now = options.now || (() => Date.now());
    const pause = options.sleepFn || sleep;
    const legacyMode = typeof options.findRegion === "function" || typeof options.readRegion === "function";
    const findRegion = options.findRegion || findGeneratedMarkdownRegion;
    const readRegion = options.readRegion || markdownFromGeneratedRegion;
    const findCandidate = options.findCandidate || findGeneratedMarkdownRegionCandidate;
    const runtimeCheck = typeof options.runtimeCheck === "function"
      ? options.runtimeCheck
      : typeof options.runtimeGuard?.check === "function"
        ? phase => options.runtimeGuard.check(phase)
        : null;
    const startedAt = now();
    let nextRuntimeCheckAt = startedAt;
    let region = null;
    let lastCandidate = null;
    let ambiguitySignature = "";
    let ambiguityStartedAt = null;
    let stabilizedAmbiguity = false;

    while (true) {
      if (options.isCancelled?.()) {
        return {
          region,
          markdown: "",
          elapsedMs: Math.max(0, now() - startedAt),
          cancelled: true,
          ambiguous: !!lastCandidate?.ambiguous,
          matchKind: lastCandidate?.matchKind || "cancelled",
          runtimeUnavailable: false
        };
      }

      const beforeCheckElapsed = Math.max(0, now() - startedAt);
      if (runtimeCheck && beforeCheckElapsed >= Math.max(0, nextRuntimeCheckAt - startedAt)) {
        let runtimeStatus;
        try {
          runtimeStatus = await runtimeCheck("markdown-viewer-wait");
        } catch (error) {
          runtimeStatus = {
            ok: false,
            error: error?.message || String(error),
            runtimeUnavailable: true,
            runtimeFailureKind: "runtime-check-exception",
            phase: "markdown-viewer-wait"
          };
        }
        const runtimeOk = runtimeStatus === true || runtimeStatus?.ok === true;
        if (!runtimeOk) {
          const failure = runtimeStatus && typeof runtimeStatus === "object"
            ? runtimeStatus
            : { ok: false, error: t("runtimeUnavailable"), runtimeUnavailable: true, phase: "markdown-viewer-wait" };
          artifactDebugLog("extension runtime lost during Markdown viewer wait", {
            phase: failure.phase || "markdown-viewer-wait",
            kind: failure.runtimeFailureKind || "runtime-unavailable",
            error: failure.error || t("runtimeUnavailable")
          });
          return {
            region,
            markdown: "",
            elapsedMs: Math.max(0, now() - startedAt),
            cancelled: true,
            ambiguous: !!lastCandidate?.ambiguous,
            matchKind: "runtime-unavailable",
            runtimeUnavailable: true,
            runtimeFailure: failure
          };
        }
        nextRuntimeCheckAt = now() + runtimeCheckIntervalMs;
      }

      if (legacyMode) {
        region = findRegion(name);
        const markdown = readRegion(region);
        if (markdown) {
          return {
            region,
            markdown,
            elapsedMs: Math.max(0, now() - startedAt),
            cancelled: false,
            ambiguous: false,
            matchKind: "custom",
            runtimeUnavailable: false
          };
        }
      } else {
        lastCandidate = findCandidate(name, { beforeRegions: options.beforeRegions });
        region = lastCandidate?.region || null;
        if (lastCandidate?.markdown) {
          artifactDebugLog("generated Markdown viewer matched", {
            name: safeArtifactName(name, ["md"]),
            matchKind: lastCandidate.matchKind,
            regionCount: lastCandidate.regionCount,
            newRegionCount: lastCandidate.newRegionCount,
            readableNodeCount: lastCandidate.readableNodeCount,
            markdownLength: lastCandidate.markdown.length
          });
          return {
            region,
            markdown: lastCandidate.markdown,
            elapsedMs: Math.max(0, now() - startedAt),
            cancelled: false,
            ambiguous: false,
            matchKind: lastCandidate.matchKind,
            runtimeUnavailable: false
          };
        }

        if (lastCandidate?.ambiguous) {
          const signature = [
            lastCandidate.matchKind || "ambiguous",
            lastCandidate.regionCount || 0,
            lastCandidate.newRegionCount || 0,
            lastCandidate.readableNodeCount || 0
          ].join(":");
          if (signature !== ambiguitySignature) {
            ambiguitySignature = signature;
            ambiguityStartedAt = now();
          } else if (ambiguityStartedAt !== null && now() - ambiguityStartedAt >= ambiguityStabilityMs) {
            stabilizedAmbiguity = true;
            break;
          }
        } else {
          ambiguitySignature = "";
          ambiguityStartedAt = null;
        }
      }

      const elapsedMs = Math.max(0, now() - startedAt);
      if (elapsedMs >= timeoutMs) break;
      let delay = Math.min(pollMs, Math.max(1, timeoutMs - elapsedMs));
      if (lastCandidate?.ambiguous && ambiguityStartedAt !== null) {
        const remainingStability = ambiguityStabilityMs - Math.max(0, now() - ambiguityStartedAt);
        if (remainingStability > 0) delay = Math.min(delay, remainingStability);
      }
      await pause(Math.max(1, delay));
    }

    artifactDebugLog("generated Markdown viewer wait ended", {
      name: safeArtifactName(name, ["md"]),
      elapsedMs: Math.max(0, now() - startedAt),
      matchKind: lastCandidate?.matchKind || (legacyMode ? "custom-timeout" : "not-found"),
      ambiguous: !!lastCandidate?.ambiguous,
      stabilizedAmbiguity,
      regionCount: lastCandidate?.regionCount || 0,
      newRegionCount: lastCandidate?.newRegionCount || 0,
      readableNodeCount: lastCandidate?.readableNodeCount || 0
    });
    return {
      region,
      markdown: "",
      elapsedMs: Math.max(0, now() - startedAt),
      cancelled: false,
      ambiguous: !!lastCandidate?.ambiguous,
      stabilizedAmbiguity,
      matchKind: lastCandidate?.matchKind || (legacyMode ? "custom-timeout" : "not-found"),
      runtimeUnavailable: false
    };
  }

  function beginMarkdownDownloadWatch(name, startedAt = Date.now()) {
    return sendExtensionMessage({
      type: "begin-markdown-download-watch",
      expectedNames: [safeArtifactName(name, ["md"])],
      startedAt
    }, { phase: "markdown-download-watch-start" });
  }

  function awaitMarkdownDownloadWatch(watchId) {
    return sendExtensionMessage({
      type: "await-markdown-download-watch",
      watchId
    }, { phase: "markdown-download-watch-await" });
  }

  function cancelMarkdownDownloadWatch(watchId) {
    if (!watchId) return Promise.resolve({ ok: true });
    return sendExtensionMessage({
      type: "cancel-markdown-download-watch",
      watchId
    }, { phase: "markdown-download-watch-cancel" });
  }

  function clickArtifactControl(node) {
    if (!node) return { found: false, attempted: false, error: "" };
    if (typeof node.click !== "function") {
      return { found: true, attempted: false, error: "control does not expose click()" };
    }
    try {
      node.click();
      return { found: true, attempted: true, error: "" };
    } catch (error) {
      return { found: true, attempted: true, error: error?.message || String(error) };
    }
  }

  function startGeneratedMarkdownDownloadCapture(row, options = {}) {
    const canonicalName = safeArtifactName(row?.name, ["md"]);
    const resolveRow = typeof options.resolveRow === "function" ? options.resolveRow : (() => row);
    const beginWatch = options.beginWatch || beginMarkdownDownloadWatch;
    const awaitWatch = options.awaitWatch || awaitMarkdownDownloadWatch;
    const cancelWatch = options.cancelWatch || cancelMarkdownDownloadWatch;
    const runtimeGuard = options.runtimeGuard || null;
    const promptDelayMs = Number.isFinite(options.promptDelayMs)
      ? Math.max(0, options.promptDelayMs)
      : MARKDOWN_DOWNLOAD_PROMPT_DELAY_MS;
    const controlPollMs = Number.isFinite(options.controlPollMs)
      ? Math.max(1, options.controlPollMs)
      : 200;
    const promptUser = options.promptUser || (() => alert(t("markdownDownloadActionRequired")));
    const attemptedControls = new Set();
    const controller = {
      watchId: "",
      captured: false,
      settled: false,
      cancelled: false,
      controlFound: false,
      activationAttempts: 0,
      activationErrors: [],
      runtimeUnavailable: false,
      runtimeFailure: null,
      promptTimer: 0,
      promptProbeTimer: 0,
      controlProbeTimer: 0,
      restore: () => {},
      result: null,
      cancel: null,
      refreshAndActivate: null
    };
    let unsubscribeRuntimeAbort = () => {};
    let cancelPromise = null;

    const cleanup = () => {
      clearTimeout(controller.promptTimer);
      clearTimeout(controller.promptProbeTimer);
      clearTimeout(controller.controlProbeTimer);
      controller.restore();
      controller.restore = () => {};
      unsubscribeRuntimeAbort();
      unsubscribeRuntimeAbort = () => {};
    };

    const markRuntimeFailure = (result, phase) => {
      const failure = runtimeGuard?.fail
        ? runtimeGuard.fail(result, phase)
        : isExtensionRuntimeFailure(result)
          ? result
          : classifyExtensionRuntimeFailure(result?.error || result || t("runtimeUnavailable"), {
            source: result?.runtimeFailureKind || "runtime-unavailable",
            phase
          });
      controller.runtimeUnavailable = true;
      controller.runtimeFailure = failure;
      controller.settled = true;
      cleanup();
      return {
        downloadedMarkdown: null,
        error: failure?.error || t("runtimeUnavailable"),
        runtimeUnavailable: true,
        runtimeFailure: failure
      };
    };

    controller.refreshAndActivate = (phase = "download-control") => {
      if (controller.settled || controller.cancelled || controller.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
        return { found: false, attempted: false, error: "", row: null };
      }
      const currentRow = resolveRow(phase) || null;
      const button = currentRow?.downloadButton || null;
      if (!button) return { found: false, attempted: false, error: "", row: currentRow };
      controller.controlFound = true;
      if (attemptedControls.has(button)) {
        return { found: true, attempted: false, error: "", row: currentRow };
      }
      attemptedControls.add(button);
      const activation = clickArtifactControl(button);
      if (activation.attempted) controller.activationAttempts += 1;
      if (activation.error) controller.activationErrors.push(activation.error);
      artifactDebugLog("Markdown download control activation", {
        phase,
        canonicalName,
        found: activation.found,
        attempted: activation.attempted,
        error: activation.error || "",
        control: artifactControlDebugSummary(button)
      });
      return { ...activation, row: currentRow };
    };

    const scheduleLateControlProbe = () => {
      const probe = () => {
        if (controller.settled || controller.cancelled || controller.controlFound || runtimeGuard?.isAborted?.()) return;
        const activation = controller.refreshAndActivate("download-control-probe");
        if (activation.found || controller.settled) return;
        controller.controlProbeTimer = setTimeout(probe, controlPollMs);
      };
      controller.controlProbeTimer = setTimeout(probe, controlPollMs);
    };

    const scheduleUserPrompt = () => {
      const tryPrompt = () => {
        if (controller.settled || controller.cancelled || controller.captured || runtimeGuard?.isAborted?.()) return;
        const currentRow = resolveRow("download-prompt-resolve") || null;
        const button = currentRow?.downloadButton || null;
        if (!button) {
          controller.promptProbeTimer = setTimeout(tryPrompt, controlPollMs);
          return;
        }
        controller.controlFound = true;
        controller.refreshAndActivate("download-prompt");
        if (controller.settled || runtimeGuard?.isAborted?.()) return;
        controller.restore();
        controller.restore = revealDownloadCandidate({ node: button });
        try { button.focus?.({ preventScroll: true }); } catch {}
        artifactDebugLog("requesting real Markdown download click", {
          canonicalName,
          control: artifactControlDebugSummary(button)
        });
        promptUser();
      };
      controller.promptTimer = setTimeout(tryPrompt, promptDelayMs);
    };

    const watchPromise = (async () => {
      const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "markdown-download-watch-start");
      if (!runtimeStatus?.ok) return markRuntimeFailure(runtimeStatus, "markdown-download-watch-start");
      if (controller.cancelled) return { ok: false, error: "download watch cancelled before start" };
      try {
        return await awaitWithRuntimeGuard(
          beginWatch(canonicalName, Date.now()),
          runtimeGuard,
          "markdown-download-watch-start",
          { intervalMs: options.runtimePollIntervalMs }
        );
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    })();

    controller.result = (async () => {
      const watch = await watchPromise;
      if (watch?.runtimeUnavailable) return watch;
      if (controller.cancelled) {
        return { downloadedMarkdown: null, error: "download watch cancelled" };
      }
      if (isExtensionRuntimeFailure(watch)) {
        return markRuntimeFailure(watch, "markdown-download-watch-start");
      }
      controller.watchId = watch?.watchId || "";
      if (!watch?.ok || !controller.watchId) {
        return {
          downloadedMarkdown: null,
          error: watch?.error || "Markdown download watch failed to start"
        };
      }

      // The exact-name watch must exist before any download activation. A
      // fresh runtime ping above prevents a stale content script from clicking
      // a file that it can no longer track or pass to the native helper.
      const initialActivation = controller.refreshAndActivate("download-watch-start");
      if (!initialActivation.found) scheduleLateControlProbe();
      scheduleUserPrompt();

      const result = await awaitWithRuntimeGuard(
        awaitWatch(controller.watchId),
        runtimeGuard,
        "markdown-download-watch-wait",
        {
          intervalMs: options.runtimePollIntervalMs,
          onRuntimeFailure: () => cancelWatch(controller.watchId)
        }
      );
      if (isExtensionRuntimeFailure(result)) {
        return markRuntimeFailure(result, "markdown-download-watch-await");
      }
      if (controller.runtimeUnavailable) {
        return {
          downloadedMarkdown: null,
          error: controller.runtimeFailure?.error || t("runtimeUnavailable"),
          runtimeUnavailable: true,
          runtimeFailure: controller.runtimeFailure
        };
      }
      if (controller.cancelled) {
        return { downloadedMarkdown: null, error: "download watch cancelled" };
      }
      if (!result?.ok || !result.download) {
        return {
          downloadedMarkdown: null,
          error: result?.error || "current Markdown download was not captured",
          downloadTrackingFailed: true
        };
      }

      const download = result.download;
      controller.captured = true;
      return {
        downloadedMarkdown: {
          name: safeArtifactName(download.name || canonicalName, ["md"]),
          sourcePath: download.sourcePath,
          downloadId: download.id,
          startTime: download.startTime,
          endTime: download.endTime
        },
        error: "",
        downloadTrackingFailed: false
      };
    })().catch(error => {
      if (isExtensionRuntimeFailure(error)) return markRuntimeFailure(error, "markdown-download-watch");
      return {
        downloadedMarkdown: null,
        error: error?.message || String(error)
      };
    }).finally(() => {
      controller.settled = true;
      cleanup();
    });

    controller.cancel = () => {
      if (cancelPromise) return cancelPromise;
      controller.cancelled = true;
      controller.settled = true;
      cleanup();
      cancelPromise = (async () => {
        const watch = await watchPromise.catch(() => null);
        controller.watchId = controller.watchId || watch?.watchId || "";
        if (controller.watchId) {
          try { await cancelWatch(controller.watchId); } catch {}
        }
      })();
      return cancelPromise;
    };

    if (runtimeGuard?.onAbort) {
      unsubscribeRuntimeAbort = runtimeGuard.onAbort((failure) => {
        controller.runtimeUnavailable = true;
        controller.runtimeFailure = failure;
        void controller.cancel();
      });
    }

    return controller;
  }

  function closeGeneratedArtifactRegion(region) {
    const close = Array.from(region?.querySelectorAll?.("button") || [])
      .find(button => /^(?:close|닫기)$/i.test(controlLabel(button)));
    try { close?.click?.(); } catch {}
  }

  async function readGeneratedMarkdownArtifactRow(row, options = {}) {
    const canonicalName = safeArtifactName(row?.name, ["md"]);
    const warnings = [];
    const runtimeGuard = options.runtimeGuard || null;
    const hasDynamicResolver = typeof options.resolveRow === "function";
    const resolveCurrentRow = (phase) => {
      if (!hasDynamicResolver) return row;
      return options.resolveRow(phase) || { name: canonicalName };
    };
    let currentRow = resolveCurrentRow("read-start");

    if (currentRow?.href) {
      try {
        const hrefRuntime = await checkRuntimeGuard(runtimeGuard, "markdown-href-read");
        if (!hrefRuntime?.ok) {
          return {
            markdown: "",
            warnings,
            runtimeUnavailable: true,
            runtimeFailure: hrefRuntime
          };
        }
        const readOperation = options.readHref
          ? options.readHref(currentRow.href, MAX_GENERATED_MARKDOWN_CHARS)
          : readTextArtifactHref(currentRow.href, MAX_GENERATED_MARKDOWN_CHARS);
        const text = await awaitWithRuntimeGuard(
          readOperation,
          runtimeGuard,
          "markdown-href-read"
        );
        if (isExtensionRuntimeFailure(text)) {
          return {
            markdown: "",
            warnings,
            runtimeUnavailable: true,
            runtimeFailure: text
          };
        }
        return { markdown: text, warnings };
      } catch (error) {
        warnings.push(`${canonicalName}: ${error?.message || String(error)}`);
        options.onHrefFailure?.();
        currentRow = resolveCurrentRow("after-href-failure") || currentRow;
      }
    }

    let region = null;
    try {
      if (options.openAndRead) {
        const text = await options.openAndRead(currentRow || { name: canonicalName });
        if (!text || !String(text).trim()) throw new Error("opened Markdown artifact is empty");
        if (String(text).length > MAX_GENERATED_MARKDOWN_CHARS) throw new Error("opened Markdown artifact is too large");
        return { markdown: String(text).replace(/\r\n?/g, "\n").trim(), warnings };
      }

      if (!options.alreadyOpened) {
        const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "markdown-viewer-open");
        if (!runtimeStatus?.ok) {
          return {
            markdown: "",
            warnings,
            runtimeUnavailable: true,
            runtimeFailure: runtimeStatus
          };
        }
        currentRow = resolveCurrentRow("viewer-open") || currentRow;
        const activation = clickArtifactControl(currentRow?.openButton);
        artifactDebugLog("Markdown file-card open activation", {
          phase: "viewer-open",
          canonicalName,
          found: activation.found,
          attempted: activation.attempted,
          error: activation.error || "",
          control: artifactControlDebugSummary(currentRow?.openButton)
        });
      }
      const result = await waitForGeneratedMarkdownRegion(canonicalName, {
        ...(options.viewerWaitOptions || {}),
        runtimeGuard: options.viewerWaitOptions?.runtimeGuard || runtimeGuard
      });
      region = result.region;
      if (result.runtimeUnavailable) {
        return {
          markdown: "",
          warnings,
          runtimeUnavailable: true,
          runtimeFailure: result.runtimeFailure || runtimeGuard?.getFailure?.() || null
        };
      }
      if (!result.markdown) {
        if (result.ambiguous) {
          throw new Error(`Markdown artifact viewer mapping is ambiguous (${result.matchKind}) after ${result.elapsedMs}ms`);
        }
        throw new Error(`matching Markdown artifact viewer did not expose readable content within ${result.elapsedMs}ms`);
      }
      artifactDebugLog("generated Markdown viewer ready", {
        name: canonicalName,
        elapsedMs: result.elapsedMs,
        matchKind: result.matchKind,
        markdownLength: result.markdown.length
      });
      return { markdown: result.markdown, warnings };
    } catch (error) {
      warnings.push(`${canonicalName}: ${error?.message || String(error)}`);
      return { markdown: "", warnings };
    } finally {
      if (region) closeGeneratedArtifactRegion(region);
    }
  }

  async function extractGeneratedMarkdownArtifact(container, options = {}) {
    if (!container) return { name: "", markdown: "", downloadedMarkdown: null, warnings: [], candidatesCount: 0 };

    const runtimeGuard = options.runtimeGuard || null;
    const runtimeStatus = runtimeGuard?.checkSync
      ? runtimeGuard.checkSync("markdown-artifact-start")
      : { ok: true, phase: "markdown-artifact-start" };
    if (!runtimeStatus?.ok) {
      return {
        name: "",
        markdown: "",
        downloadedMarkdown: null,
        warnings: [],
        candidatesCount: 0,
        runtimeUnavailable: true,
        runtimeFailure: runtimeStatus
      };
    }

    const staticRows = Array.isArray(options.rows) ? options.rows : null;
    const collectRowsNow = () => {
      let currentRows = [];
      if (typeof options.resolveRows === "function") {
        currentRows = Array.from(options.resolveRows(container, ["md"]) || []);
      } else {
        currentRows = collectArtifactFileRows(container, ["md"]);
      }
      if (!currentRows.length && staticRows && typeof options.resolveRows !== "function") {
        return staticRows;
      }
      return currentRows;
    };

    let rows = staticRows || collectRowsNow();
    let selected = selectGeneratedMarkdownArtifact(rows);
    if (!selected.row && !options.skipReveal) {
      await revealCollapsedGeneratedArtifacts(container);
      rows = collectRowsNow();
      selected = selectGeneratedMarkdownArtifact(rows);
    }

    const warnings = selected.warning ? [selected.warning] : [];
    if (!selected.row) {
      return { name: "", markdown: "", downloadedMarkdown: null, warnings, candidatesCount: rows.length };
    }

    const canonicalName = safeArtifactName(selected.row.name, ["md"]);
    const staticFallbackAllowed = !!staticRows && typeof options.resolveRows !== "function";
    const resolveSelectedRow = (phase = "") => {
      const currentRows = collectRowsNow();
      const matches = currentRows.filter(item => safeArtifactName(item?.name, ["md"]) === canonicalName);
      let current = choosePreferredArtifactRow(matches);
      if (!current && staticFallbackAllowed) {
        current = choosePreferredArtifactRow(staticRows.filter(item => safeArtifactName(item?.name, ["md"]) === canonicalName));
      }
      if (phase) logArtifactRowResolution(phase, canonicalName, matches, current);
      return current;
    };

    const viewerSnapshot = options.viewerSnapshot || captureGeneratedMarkdownRegionSnapshot();
    let alreadyOpened = false;
    let downloadCapture = null;
    let openPromptTimer = 0;
    let restoreOpenControl = () => {};
    let openPromptScheduled = false;
    let openPromptCancelled = false;
    const openActivationErrors = [];
    const attemptedOpenControls = new Set();

    const cleanupOpenPrompt = () => {
      openPromptCancelled = true;
      clearTimeout(openPromptTimer);
      restoreOpenControl();
      restoreOpenControl = () => {};
    };

    const scheduleOpenPrompt = () => {
      if (openPromptScheduled || options.openAndRead) return;
      openPromptScheduled = true;
      const delayMs = Number.isFinite(options.openPromptDelayMs)
        ? Math.max(0, options.openPromptDelayMs)
        : MARKDOWN_OPEN_PROMPT_DELAY_MS;
      const probeMs = Number.isFinite(options.openPromptPollMs)
        ? Math.max(1, options.openPromptPollMs)
        : 200;
      const promptUser = options.promptOpenUser || (() => alert(t("markdownOpenActionRequired")));
      const tryPrompt = async () => {
        if (openPromptCancelled || downloadCapture?.captured || runtimeGuard?.isAborted?.()) return;
        const promptRuntime = await checkRuntimeGuard(runtimeGuard, "markdown-viewer-open-prompt");
        if (!promptRuntime?.ok) {
          cleanupOpenPrompt();
          return;
        }
        const currentRow = resolveSelectedRow();
        const button = currentRow?.openButton || null;
        if (!button) {
          openPromptTimer = setTimeout(() => { void tryPrompt(); }, probeMs);
          return;
        }
        logArtifactRowResolution("open-prompt", canonicalName, [currentRow], currentRow);
        restoreOpenControl();
        restoreOpenControl = revealDownloadCandidate({ node: button });
        try { button.focus?.({ preventScroll: true }); } catch {}
        promptUser();
      };
      openPromptTimer = setTimeout(() => { void tryPrompt(); }, delayMs);
    };

    const ensureDownloadCapture = () => {
      if (downloadCapture || options.openAndRead) return downloadCapture;
      const startCapture = options.startDownloadCapture || startGeneratedMarkdownDownloadCapture;
      const currentRow = resolveSelectedRow("download-watch-resolve") || { name: canonicalName };
      downloadCapture = startCapture(
        { ...currentRow, name: canonicalName },
        {
          ...(options.downloadCaptureOptions || {}),
          runtimeGuard: options.downloadCaptureOptions?.runtimeGuard || runtimeGuard,
          resolveRow: (phase) => resolveSelectedRow(phase)
        }
      );
      return downloadCapture;
    };

    const attemptOpen = (phase) => {
      const openRuntime = runtimeGuard?.checkSync
        ? runtimeGuard.checkSync(phase)
        : { ok: true, phase };
      if (!openRuntime?.ok) {
        return { found: false, attempted: false, error: openRuntime.error || t("runtimeUnavailable"), runtimeUnavailable: true };
      }
      const currentRow = resolveSelectedRow(phase);
      const button = currentRow?.openButton || null;
      const activation = button && attemptedOpenControls.has(button)
        ? { found: true, attempted: false, error: "" }
        : clickArtifactControl(button);
      if (button && activation.attempted) attemptedOpenControls.add(button);
      if (activation.error) openActivationErrors.push(activation.error);
      artifactDebugLog("Markdown file-card open activation", {
        phase,
        canonicalName,
        found: activation.found,
        attempted: activation.attempted,
        error: activation.error || "",
        control: artifactControlDebugSummary(currentRow?.openButton)
      });
      if (activation.attempted && !activation.error) alreadyOpened = true;
      return activation;
    };

    const initialRow = resolveSelectedRow("initial-selection");
    if ((!initialRow?.href || !isFetchableDownloadHref(initialRow.href)) && !options.openAndRead) {
      ensureDownloadCapture();
      scheduleOpenPrompt();
      attemptOpen("open-before-first-wait");
    }

    const rowForRead = resolveSelectedRow("read-resolve") || (staticFallbackAllowed ? selected.row : { name: canonicalName });
    if ((!rowForRead?.href || !isFetchableDownloadHref(rowForRead.href)) && !options.openAndRead) {
      ensureDownloadCapture();
      scheduleOpenPrompt();
      attemptOpen("open-after-rerender-resolve");
    }
    const result = await readGeneratedMarkdownArtifactRow(
      { ...rowForRead, name: canonicalName },
      {
        ...options,
        runtimeGuard,
        resolveRow: (phase) => resolveSelectedRow(phase),
        alreadyOpened,
        onHrefFailure: () => {
          ensureDownloadCapture();
          scheduleOpenPrompt();
        },
        viewerWaitOptions: {
          ...(options.viewerWaitOptions || {}),
          beforeRegions: options.viewerWaitOptions?.beforeRegions || viewerSnapshot,
          runtimeGuard: options.viewerWaitOptions?.runtimeGuard || runtimeGuard,
          isCancelled: () => !!downloadCapture?.captured || !!options.viewerWaitOptions?.isCancelled?.()
        }
      }
    );

    if (result.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
      await downloadCapture?.cancel?.();
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length,
        runtimeUnavailable: true,
        runtimeFailure: result.runtimeFailure || runtimeGuard?.getFailure?.() || null
      };
    }

    if (result.markdown) {
      await downloadCapture?.cancel?.();
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: result.markdown,
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length
      };
    }

    const fallbackRuntime = await checkRuntimeGuard(runtimeGuard, "markdown-download-fallback");
    if (!fallbackRuntime?.ok) {
      await downloadCapture?.cancel?.();
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length,
        runtimeUnavailable: true,
        runtimeFailure: fallbackRuntime
      };
    }
    downloadCapture?.refreshAndActivate?.("download-fallback-before-await");
    const downloadedResult = downloadCapture
      ? await downloadCapture.result
      : { downloadedMarkdown: null, error: "" };
    if (downloadedResult.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length,
        runtimeUnavailable: true,
        runtimeFailure: downloadedResult.runtimeFailure || runtimeGuard?.getFailure?.() || null
      };
    }
    if (downloadedResult.downloadedMarkdown) {
      artifactDebugLog("captured generated Markdown download", {
        name: downloadedResult.downloadedMarkdown.name,
        downloadId: downloadedResult.downloadedMarkdown.downloadId
      });
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: downloadedResult.downloadedMarkdown,
        warnings,
        candidatesCount: rows.length
      };
    }

    const finalRow = resolveSelectedRow("final-warning");
    const exactControlFound = !!finalRow?.downloadButton || !!downloadCapture?.controlFound;
    const classifiedWarnings = [];
    if (!options.openAndRead && downloadCapture) {
      if (!exactControlFound) {
        classifiedWarnings.push(`${canonicalName}: exact File download control was not found in the current artifact row`);
        if (downloadedResult.error && !/download-watch-timeout/i.test(downloadedResult.error)) {
          classifiedWarnings.push(`${canonicalName}: Markdown download fallback failed: ${downloadedResult.error}`);
        }
      } else if (downloadCapture.activationErrors?.length) {
        classifiedWarnings.push(`${canonicalName}: exact File download control was found, but activation failed: ${downloadCapture.activationErrors[0]}`);
      } else {
        const detail = downloadedResult.error || "the current download could not be tracked";
        classifiedWarnings.push(`${canonicalName}: exact File download control was found and activation was attempted, but the current download could not be tracked: ${detail}`);
      }
    }
    if (openActivationErrors.length) {
      classifiedWarnings.push(`${canonicalName}: Markdown file-card open control was found, but activation failed: ${openActivationErrors[0]}`);
    }

    cleanupOpenPrompt();
    return {
      name: canonicalName,
      markdown: "",
      downloadedMarkdown: null,
      warnings: Array.from(new Set([
        ...warnings,
        ...result.warnings,
        ...classifiedWarnings
      ].filter(Boolean))),
      candidatesCount: rows.length
    };
  }

  function normalizeMarkdownForComparison(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function detailedMarkdownBody(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g, "GPT_OBSIDIAN_ATTACHMENTS")
      .replace(new RegExp(`^# ${escapeRegExp(DETAILED_MARKDOWN_HEADING)}\\s*$`, "gm"), "")
      .trim();
  }

  function mergeDetailedMarkdownSection(noteContent, detailedMarkdown) {
    const body = detailedMarkdownBody(detailedMarkdown);
    if (!body) return noteContent;

    const headingLine = `# ${DETAILED_MARKDOWN_HEADING}`;
    const headingPattern = new RegExp(`^${escapeRegExp(headingLine)}\\s*$`, "gm");
    let base = String(noteContent || "").replace(/\r\n?/g, "\n");
    const exactBodyIndex = base.indexOf(body);
    if (exactBodyIndex >= 0) {
      base = `${base.slice(0, exactBodyIndex).trimEnd()}\n\n${base.slice(exactBodyIndex + body.length).trimStart()}`.trim();
    } else {
      const normalizedBody = normalizeMarkdownForComparison(body);
      if (normalizeMarkdownForComparison(base).includes(normalizedBody) && headingPattern.test(base)) {
        return base;
      }
    }

    headingPattern.lastIndex = 0;
    const existingHeading = headingPattern.exec(base);
    if (existingHeading) {
      base = base.slice(0, existingHeading.index).trimEnd();
    }
    base = base.replace(headingPattern, "").trimEnd();
    return `${base}\n\n${headingLine}\n\n${body}\n`;
  }

  function mergeDownloadedDetailedMarkdownMarker(noteContent) {
    return mergeDetailedMarkdownSection(noteContent, DETAILED_MARKDOWN_MARKER);
  }

  function downloadCandidateClickPriority(candidate) {
    const node = candidate?.node;
    if (!node) return 0;
    if (isExactDownloadControl(node)) return 600;
    if (hasDownloadAttribute(node)) return 500;
    if (isBlobOrSandboxHref(candidate.href)) return 400;
    if (isFetchableDownloadHref(candidate.href)) return 300;
    if (isLikelyInteractiveHtmlFileCard(node, candidate.href)) return 100;
    return 10;
  }

  function getDownloadCandidates(container, expectedNames = []) {
    if (!container) return [];

    const nodes = Array.from(container.querySelectorAll([
      "a[href]",
      "a[download]",
      "button",
      "[role='button']",
      "[data-testid*='download']",
      "[data-testid*='artifact' i]",
      "[data-testid*='file' i]",
      "[data-file-name]",
      "[data-filename]",
      "[aria-label*='download' i]",
      "[aria-label*='file' i]",
      "[aria-label*='파일' i]",
      "[title*='download' i]"
    ].join(","))).filter(node => !isInsideUnsupportedRichAppBlock(node));

    const seen = new Map();
    const candidates = [];
    nodes.forEach(node => {
      const discoveredHref = findDownloadHref(node);
      const href = isAssociatedArtifactHref(node, discoveredHref) ? discoveredHref : "";
      const ownText = `${node.innerText || node.textContent || ""} ${node.getAttribute?.("download") || ""} ${node.getAttribute?.("data-file-name") || ""} ${node.getAttribute?.("data-filename") || ""}`;
      const singletonExpectedName = expectedNames.length === 1 ? expectedNames[0] : "";
      const detectedName = filenameFromText(ownText) || findNearbyFilename(node) || filenameFromUrl(href) || singletonExpectedName || "";
      if (!detectedName) return;
      const name = safeDownloadName(detectedName);
      const marker = decodePercentEncodedRuns(`${href} ${ownText} ${node.getAttribute?.("aria-label") || ""} ${node.getAttribute?.("title") || ""} ${node.getAttribute?.("data-testid") || ""}`);
      const htmlMarker = `${name} ${marker}`;
      const looksLikeHtml = /\.html?(?:$|[?#\s])/i.test(htmlMarker);
      const looksLikeFileCard = isLikelyInteractiveHtmlFileCard(node, href);
      const looksLikeDownload = /download|다운로드|artifact|attachment|첨부/i.test(marker) || hasDownloadAttribute(node) || isBlobOrSandboxHref(href) || looksLikeFileCard;
      if (!looksLikeDownload) return;
      if (!looksLikeHtml && !expectedNames.length) return;
      if (isPlainExternalAnchor(node, href)) return;

      const key = `${href || "nohref"}::${name}`;
      const candidate = { name, href, node };
      const existingIndex = seen.get(key);
      if (existingIndex !== undefined) {
        if (downloadCandidateClickPriority(candidate) > downloadCandidateClickPriority(candidates[existingIndex])) {
          candidates[existingIndex] = candidate;
        }
        return;
      }
      seen.set(key, candidates.length);
      candidates.push(candidate);
    });

    return candidates;
  }

  function hasSynchronousReadableHtmlSource(container) {
    if (!container?.querySelectorAll && !container?.querySelector) return false;
    const selector = [
      "iframe[srcdoc]",
      "iframe[src^='blob:']",
      "iframe[src^='data:']",
      "pre.cm-content",
      ".cm-content",
      "[role='textbox'][contenteditable='true']",
      ".cm-editor",
      "pre code"
    ].join(",");
    return hasNonRichSelectorMatch(container, selector);
  }

  function findUserActivatedDownloadCandidate(btn) {
    const container = closestArtifactContainer(btn);
    if (!container || hasSynchronousReadableHtmlSource(container)) return null;
    return getDownloadCandidates(container)
      .filter(canClickDownloadCandidate)
      .filter(candidate => !isFetchableDownloadHref(candidate.href))
      .filter(candidate => isExactDownloadControl(candidate.node) || hasDownloadAttribute(candidate.node))
      .sort((a, b) => downloadCandidateClickPriority(b) - downloadCandidateClickPriority(a))[0] || null;
  }

  function revealDownloadCandidate(candidate) {
    const changed = [];
    let node = candidate?.node || null;
    for (let depth = 0; depth < 4 && node; depth++, node = node.parentElement) {
      if (!node.style) continue;
      changed.push({
        node,
        pointerEvents: node.style.pointerEvents,
        opacity: node.style.opacity,
        outline: node.style.outline,
        outlineOffset: node.style.outlineOffset
      });
      node.style.pointerEvents = "auto";
      node.style.opacity = "1";
    }
    if (candidate?.node?.style) {
      candidate.node.style.outline = "3px solid #f59e0b";
      candidate.node.style.outlineOffset = "3px";
    }
    try { candidate?.node?.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}

    return () => {
      changed.forEach(item => {
        item.node.style.pointerEvents = item.pointerEvents;
        item.node.style.opacity = item.opacity;
        item.node.style.outline = item.outline;
        item.node.style.outlineOffset = item.outlineOffset;
      });
    };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function readDownloadCandidate(candidate) {
    if (!candidate.href) {
      throw new Error("download link not found");
    }
    if (/^sandbox:/i.test(candidate.href)) {
      throw new Error("sandbox link cannot be fetched by the extension");
    }
    if (!isFetchableDownloadHref(candidate.href)) {
      throw new Error(`download href is not page-fetchable: ${hrefScheme(candidate.href)}`);
    }

    const res = await fetch(candidate.href, { credentials: "include" });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);

    const text = await res.text();
    if (!text.trim()) throw new Error("downloaded file is empty");
    if (text.length > MAX_HTML_ATTACHMENT_CHARS) throw new Error("downloaded file is too large for native messaging");

    return {
      name: candidate.name,
      content: text
    };
  }

  async function readHtmlPreviews(container, expectedNames = [], candidates = []) {
    const files = [];
    if (!container) return files;

    const frames = Array.from(container.querySelectorAll("iframe"))
      .filter(frame => !isInsideUnsupportedRichAppBlock(frame));
    const fallbackNames = Array.from(new Set([
      ...expectedNames,
      ...candidates.map(candidate => candidate?.name || "")
    ].filter(name => /\.html?$/i.test(name || "")).map(safeDownloadName)));
    for (const frame of frames) {
      const root = findArtifactRoot(frame, container);
      const scopedName = findScopedArtifactFilename(root);
      const fallbackName = frames.length === 1 && fallbackNames.length === 1 ? fallbackNames[0] : "";
      const name = scopedName || fallbackName;
      if (!name) continue;
      let content = "";

      try {
        if (frame.getAttribute("srcdoc")) {
          content = frame.getAttribute("srcdoc");
        } else if (frame.src && /^blob:/i.test(frame.src)) {
          const res = await fetch(frame.src);
          if (res.ok) content = await res.text();
        } else if (frame.contentDocument?.documentElement) {
          content = "<!doctype html>\n" + frame.contentDocument.documentElement.outerHTML;
        }
      } catch (error) {
        console.warn("Failed to read ChatGPT HTML preview frame.", error);
      }

      if (content && /<html\b|<!doctype html/i.test(content) && content.length <= MAX_HTML_ATTACHMENT_CHARS) {
        debugLog("captured HTML preview frame", { name, bytes: content.length, scheme: hrefScheme(frame.src) });
        files.push({ name, content });
      }
    }

    return files;
  }

  function controlLabel(node) {
    return String(
      node?.getAttribute?.("aria-label") ||
      node?.getAttribute?.("title") ||
      node?.innerText ||
      node?.textContent ||
      ""
    ).trim();
  }

  function isArtifactPreviewToggle(button) {
    return /^(?:preview|미리\s*보기)$/i.test(controlLabel(button));
  }

  function findArtifactToggleGroup(button) {
    if (!button) return null;
    const explicitGroup = button.closest?.('[role="group"]');
    let node = explicitGroup || button.parentElement;
    for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
      const buttons = Array.from(node.querySelectorAll?.("button") || []);
      if (buttons.includes(button) && buttons.some(candidate => candidate !== button && isArtifactPreviewToggle(candidate))) {
        return node;
      }
    }
    return null;
  }

  function isArtifactCodeToggle(button) {
    if (!/^(?:code|coding|코드|코딩)$/i.test(controlLabel(button))) return false;
    return !!findArtifactToggleGroup(button);
  }

  function findArtifactRoot(toggle, container) {
    let node = toggle;
    for (let depth = 0; depth < 10 && node; depth++, node = node.parentElement) {
      if (node.querySelector?.("iframe, pre.cm-content, .cm-content, .cm-editor, pre code")) return node;
      if (node === container) break;
    }
    return null;
  }

  function findScopedArtifactFilename(root) {
    if (!root?.querySelectorAll) return "";
    const nodes = [root, ...Array.from(root.querySelectorAll([
      "[data-file-name]",
      "[data-filename]",
      "[aria-label]",
      "[title]",
      "header",
      "button",
      "[role='button']"
    ].join(",")))];
    const names = new Set();
    for (const node of nodes) {
      const values = [
        node.getAttribute?.("data-file-name") || "",
        node.getAttribute?.("data-filename") || "",
        node.getAttribute?.("aria-label") || "",
        node.getAttribute?.("title") || ""
      ];
      const ownText = String(node.innerText || node.textContent || "").trim();
      if (ownText.length <= 260) values.push(ownText);
      values.forEach(value => {
        const name = filenameFromArtifactText(value, ["html", "htm"]);
        if (name) names.add(safeDownloadName(name));
      });
    }
    return names.size === 1 ? Array.from(names)[0] : "";
  }

  function collectInteractiveArtifactDescriptors(container, expectedNames = [], candidates = []) {
    if (!container?.querySelectorAll) return [];
    const descriptors = [];
    const toggles = Array.from(container.querySelectorAll("button"))
      .filter(button => !isInsideUnsupportedRichAppBlock(button))
      .filter(isArtifactCodeToggle);
    toggles.forEach(codeToggle => {
      const root = findArtifactRoot(codeToggle, container);
      if (!root || descriptors.some(item => item.root === root)) return;
      const group = findArtifactToggleGroup(codeToggle);
      const previewToggle = Array.from(group?.querySelectorAll?.("button") || []).find(isArtifactPreviewToggle) || null;
      descriptors.push({
        name: findScopedArtifactFilename(root),
        root,
        codeToggle,
        previewToggle,
        restorePreview: codeToggle.getAttribute?.("aria-pressed") !== "true" && !!previewToggle
      });
    });

    const fallbackNames = Array.from(new Set([
      ...expectedNames,
      ...candidates.map(candidate => candidate?.name || "")
    ].filter(name => /\.html?$/i.test(name || "")).map(safeDownloadName)));
    if (descriptors.length === 1 && !descriptors[0].name && fallbackNames.length === 1) {
      descriptors[0].name = fallbackNames[0];
    }
    return descriptors;
  }

  function extractCompleteHtmlSource(root) {
    if (!root?.querySelectorAll) return "";
    const sourceSelector = [
      "pre.cm-content",
      ".cm-content",
      "[role='textbox'][contenteditable='true']",
      "pre code",
      "code",
      "textarea"
    ].join(",");
    const nodes = Array.from(root.querySelectorAll(sourceSelector));
    if (root.matches?.(sourceSelector)) nodes.unshift(root);
    for (const node of nodes) {
      const source = String(
        node.value ||
        node.getAttribute?.("aria-valuetext") ||
        node.innerText ||
        node.textContent ||
        ""
      )
        .replace(/\r\n?/g, "\n")
        .trim();
      if (!source || source.length > MAX_HTML_ATTACHMENT_CHARS) continue;
      if (!/^\s*(?:<!doctype html>|<html\b)/i.test(source)) continue;
      if (!/<\/html>\s*$/i.test(source)) continue;
      return source;
    }
    return "";
  }

  function extractCurrentArtifactHtmlSource(codeToggle, container) {
    const currentRoot = findArtifactRoot(codeToggle, container);
    return extractCompleteHtmlSource(currentRoot);
  }

  function hasInteractiveHtmlArtifactCandidate(container, candidates, expectedNames = []) {
    const candidateMatch = candidates.some(candidate => {
      const candidateName = candidate?.name || findNearbyFilename(candidate?.node) || filenameFromUrl(candidate?.href || "");
      if (!/\.html?$/i.test(candidateName)) return false;
      return isLikelyInteractiveHtmlFileCard(candidate.node, candidate.href) ||
        isExactDownloadControl(candidate.node) ||
        hasDownloadAttribute(candidate.node) ||
        isBlobOrSandboxHref(candidate.href) ||
        hasNearbyArtifactViewer(candidate.node);
    });
    if (candidateMatch) return true;

    let visibleArtifactText = container?.innerText || container?.textContent || "";
    try {
      const clone = container?.cloneNode?.(true);
      if (clone) {
        removeUnsupportedRichAppBlocks(clone);
        visibleArtifactText = clone.innerText || clone.textContent || "";
      }
    } catch {}
    const visibleNames = filenamesFromText(visibleArtifactText);
    const hasHtmlName = [...expectedNames, ...visibleNames].some(name => /\.html?$/i.test(name || ""));
    if (!hasHtmlName || !container?.querySelectorAll) return false;

    const buttons = Array.from(container.querySelectorAll("button"))
      .filter(button => !isInsideUnsupportedRichAppBlock(button));
    const hasCodeToggle = buttons.some(button => /^(?:code|coding|코드|코딩)$/i.test(controlLabel(button)));
    const hasPreviewToggle = buttons.some(isArtifactPreviewToggle);
    const viewerSelector = "iframe, .cm-editor, pre.cm-content, .cm-content, [data-testid*='artifact' i]";
    const hasViewer = hasNonRichSelectorMatch(container, viewerSelector);
    return hasCodeToggle && hasPreviewToggle && hasViewer;
  }

  async function readInteractiveHtmlArtifacts(container, expectedNames = [], candidates = []) {
    const files = [];
    const warnings = [];
    if (!container) return files;
    if (!hasInteractiveHtmlArtifactCandidate(container, candidates, expectedNames)) {
      return files;
    }

    const descriptors = collectInteractiveArtifactDescriptors(container, expectedNames, candidates);
    const nameCounts = new Map();
    descriptors.forEach(item => {
      if (item.name) nameCounts.set(item.name, (nameCounts.get(item.name) || 0) + 1);
    });

    for (const descriptor of descriptors) {
      const { name } = descriptor;
      if (!name) {
        warnings.push("An HTML artifact viewer had no unique filename in its own viewer root.");
        continue;
      }
      if ((nameCounts.get(name) || 0) !== 1) {
        warnings.push(`Multiple HTML artifact viewers claimed the same filename: ${name}`);
        continue;
      }

      let currentDescriptor = descriptor;
      let source = extractCompleteHtmlSource(currentDescriptor.root);

      if (!source) {
        try {
          descriptor.codeToggle.click();
          for (let attempt = 0; attempt < 30 && !source; attempt++) {
            await sleep(100);
            const refreshed = collectInteractiveArtifactDescriptors(container, expectedNames, candidates);
            currentDescriptor = refreshed.find(item => item.name === name) || currentDescriptor;
            source = extractCompleteHtmlSource(currentDescriptor.root);
          }
        } catch (error) {
          debugLog("failed to open ChatGPT artifact code view", {
            name,
            reason: error?.message || String(error)
          });
        }
      }

      if (source) {
        pushUniqueFile(files, { name, content: source, source: "artifact-code-view" });
        debugLog("captured ChatGPT artifact code view", { name, bytes: source.length });
      } else {
        warnings.push(`HTML artifact source was not readable for ${name}.`);
      }

      if (descriptor.restorePreview) {
        try {
          const refreshed = collectInteractiveArtifactDescriptors(container, expectedNames, candidates);
          const currentPreviewToggle = refreshed.find(item => item.name === name)?.previewToggle || currentDescriptor.previewToggle || descriptor.previewToggle;
          currentPreviewToggle?.click?.();
        } catch {}
      }
    }

    files.warnings = warnings;
    return files;
  }

  function extractHtmlCodeBlockFiles(markdownText, expectedNames = []) {
    if (!settings.saveHtmlCodeBlocks) return [];

    const files = [];
    const source = String(markdownText || "");
    const codeBlocks = source.matchAll(/(^|\n)(`{3,})([^\n`]*)\n([\s\S]*?)\n\2(?=\n|$)/g);
    let index = 0;

    for (const match of codeBlocks) {
      const lang = (match[3] || "").trim().toLowerCase();
      const code = (match[4] || "").trim();
      const looksLikeHtml = lang === "html" || /^\s*(?:<!doctype html>|<html\b)/i.test(code);
      if (!looksLikeHtml) continue;

      index += 1;
      const name = safeDownloadName(expectedNames[index - 1] || `html-code-block-${index}.html`);
      pushUniqueFile(files, { name, content: code, source: "html-code-block" });
      debugLog("captured HTML code block attachment", { name, bytes: code.length });
    }

    return files;
  }

  function pushUniqueFile(files, file) {
    if (!file?.content) return;
    const key = `${file.name}::${file.content.length}::${file.content.slice(0, 80)}`;
    if (files.some(existing => `${existing.name}::${existing.content.length}::${existing.content.slice(0, 80)}` === key)) {
      return;
    }
    files.push(file);
  }

  function htmlDocumentMetadata(content) {
    const source = String(content || "");
    const stripTags = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return {
      title: stripTags(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
      heading: stripTags(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
    };
  }

  function validateCapturedHtmlFiles(inputFiles) {
    const warnings = [];
    const byName = new Map();
    const ambiguousNames = new Set();

    for (const file of inputFiles || []) {
      if (!file?.content || !/\.html?$/i.test(file.name || "")) continue;
      const normalizedContent = String(file.content).replace(/\r\n?/g, "\n").trim();
      if (!/^\s*(?:<!doctype html>|<html\b)/i.test(normalizedContent) || !/<\/html>\s*$/i.test(normalizedContent)) {
        warnings.push(`Incomplete HTML was excluded: ${file.name}`);
        continue;
      }
      const key = String(file.name).toLowerCase();
      const existing = byName.get(key);
      if (existing && existing.content !== normalizedContent) {
        ambiguousNames.add(key);
        warnings.push(`Conflicting HTML sources claimed the same filename: ${file.name}`);
        continue;
      }
      if (!existing) {
        const metadata = htmlDocumentMetadata(normalizedContent);
        byName.set(key, { ...file, content: normalizedContent, metadata });
        debugLog("validated HTML identity", { name: file.name, title: metadata.title, heading: metadata.heading });
      }
    }

    ambiguousNames.forEach(key => byName.delete(key));
    const contentGroups = new Map();
    for (const file of byName.values()) {
      const group = contentGroups.get(file.content) || [];
      group.push(file);
      contentGroups.set(file.content, group);
    }

    const rejectedNames = new Set();
    for (const group of contentGroups.values()) {
      const names = Array.from(new Set(group.map(file => file.name)));
      if (names.length > 1) {
        names.forEach(name => rejectedNames.add(name.toLowerCase()));
        warnings.push(`Identical HTML content was mapped to different filenames and was excluded: ${names.join(", ")}`);
      }
    }

    return {
      files: Array.from(byName.values())
        .filter(file => !rejectedNames.has(file.name.toLowerCase()))
        .map(({ metadata, ...file }) => file),
      warnings
    };
  }

  function classifyExtensionRuntimeFailure(error, options = {}) {
    const message = String(error?.message || error || t("runtimeUnavailable")).trim() || t("runtimeUnavailable");
    const lower = message.toLowerCase();
    let kind = options.source || "runtime-error";
    if (options.source === "runtime-missing" || /runtime.*unavailable/.test(lower)) {
      kind = "runtime-missing";
    } else if (/extension context invalidated|context invalidated|extension has been reloaded/.test(lower)) {
      kind = "context-invalidated";
    } else if (/receiving end does not exist|could not establish connection|message port closed|port closed|no matching message handler/.test(lower)) {
      kind = "message-channel-unavailable";
    } else if (options.source === "runtime-last-error") {
      kind = "runtime-last-error";
    } else if (options.source === "send-exception") {
      kind = "runtime-send-exception";
    }
    return {
      ok: false,
      error: message,
      runtimeUnavailable: true,
      runtimeFailureKind: kind,
      phase: options.phase || ""
    };
  }

  function isExtensionRuntimeFailure(result) {
    return !!result?.runtimeUnavailable;
  }

  function checkExtensionRuntimeSynchronously(phase = "runtime-sync-check") {
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        return classifyExtensionRuntimeFailure(t("runtimeUnavailable"), {
          source: "runtime-missing",
          phase
        });
      }
      // A stale content script left behind by an unpacked-extension reload can
      // retain a chrome.runtime-shaped object while losing its extension ID.
      if (!globalThis.chrome.runtime.id) {
        return classifyExtensionRuntimeFailure("extension context invalidated", {
          source: "context-invalidated",
          phase
        });
      }
      return { ok: true, phase };
    } catch (error) {
      return classifyExtensionRuntimeFailure(error, {
        source: "context-invalidated",
        phase
      });
    }
  }

  function sendExtensionMessage(message, options = {}) {
    return new Promise(resolve => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve(classifyExtensionRuntimeFailure(t("runtimeUnavailable"), {
          source: "runtime-missing",
          phase: options.phase || message?.type || ""
        }));
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          let err = null;
          try { err = globalThis.chrome?.runtime?.lastError || null; } catch (error) { err = error; }
          if (err) {
            resolve(classifyExtensionRuntimeFailure(err, {
              source: "runtime-last-error",
              phase: options.phase || message?.type || ""
            }));
            return;
          }
          resolve(response || { ok: false, error: "empty extension response" });
        });
      } catch (error) {
        resolve(classifyExtensionRuntimeFailure(error, {
          source: "send-exception",
          phase: options.phase || message?.type || ""
        }));
      }
    });
  }

  function requestClipboardReadPermission() {
    return sendExtensionMessage(
      { type: CLIPBOARD_PERMISSION_REQUEST_TYPE },
      { phase: "clipboard-read-permission" }
    ).then(result => result?.ok === true && result?.granted === true, () => false);
  }

  async function pingExtensionRuntime(phase = "runtime-ping", options = {}) {
    const sender = options.sendMessage || sendExtensionMessage;
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, options.timeoutMs)
      : RUNTIME_PING_TIMEOUT_MS;
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(classifyExtensionRuntimeFailure(`extension runtime ping timed out after ${timeoutMs}ms`, {
            source: "runtime-ping-timeout",
            phase
          }));
        }, timeoutMs);
        Promise.resolve(sender({ type: RUNTIME_PING_TYPE, phase }, { phase })).then(
          value => {
            clearTimeout(timer);
            resolve(value);
          },
          error => {
            clearTimeout(timer);
            reject(error);
          }
        );
      });
    } catch (error) {
      return classifyExtensionRuntimeFailure(error, { source: "send-exception", phase });
    }
    if (result?.ok && result?.pong === true) {
      if (result.version && result.version !== VERSION) {
        return classifyExtensionRuntimeFailure(
          `extension version changed from ${VERSION} to ${result.version}`,
          { source: "runtime-version-mismatch", phase }
        );
      }
      return { ok: true, pong: true, phase, backgroundVersion: result.version || "" };
    }
    if (isExtensionRuntimeFailure(result)) {
      return { ...result, phase: result.phase || phase };
    }
    return classifyExtensionRuntimeFailure(result?.error || "extension runtime ping failed", {
      source: "runtime-ping-failed",
      phase
    });
  }

  async function pingNativeHelper(phase = "native-preflight", options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const sender = options.sendMessage || sendExtensionMessage;
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, options.timeoutMs)
      : NATIVE_PREFLIGHT_TIMEOUT_MS;
    const runtimeStatus = await checkRuntimeGuard(runtimeGuard, phase);
    if (!runtimeStatus?.ok) return runtimeStatus;
    let timer = null;
    try {
      const response = await Promise.race([
        Promise.resolve(sender({ type: NATIVE_PREFLIGHT_TYPE, phase }, { phase })),
        new Promise(resolve => {
          timer = setTimeout(() => resolve({ ok: false, error: `Native helper preflight timed out after ${timeoutMs}ms` }), timeoutMs);
        })
      ]);
      if (timer !== null) clearTimeout(timer);
      if (response?.ok && response?.pong === true && response?.native === true) {
        return { ok: true, pong: true, native: true, phase };
      }
      if (isExtensionRuntimeFailure(response)) return response;
      return { ok: false, error: response?.error || "Native helper preflight failed", phase };
    } catch (error) {
      if (timer !== null) clearTimeout(timer);
      return { ok: false, error: error?.message || String(error), phase };
    }
  }

  function createRuntimeGuard(options = {}) {
    const ping = options.ping || pingExtensionRuntime;
    const syncCheck = options.syncCheck || checkExtensionRuntimeSynchronously;
    const notifyUser = options.notifyUser || (() => alert(t("runtimeDisconnectedRefresh")));
    const listeners = new Set();
    let failure = null;
    let notified = false;
    let checkInFlight = null;

    const recordFailure = (result, phase = "") => {
      if (failure) return failure;
      const normalized = isExtensionRuntimeFailure(result)
        ? { ...result, phase: result.phase || phase }
        : classifyExtensionRuntimeFailure(result?.error || result || t("runtimeUnavailable"), {
          source: result?.runtimeFailureKind || "runtime-unavailable",
          phase
        });
      failure = normalized;
      artifactDebugLog("extension runtime unavailable", {
        phase: normalized.phase || phase,
        kind: normalized.runtimeFailureKind || "runtime-unavailable",
        error: normalized.error || t("runtimeUnavailable")
      });
      listeners.forEach(listener => {
        try { listener(normalized); } catch {}
      });
      return failure;
    };

    return {
      checkSync(phase = "runtime-sync-check") {
        if (failure) return failure;
        let result;
        try {
          result = syncCheck(phase);
        } catch (error) {
          result = classifyExtensionRuntimeFailure(error, { source: "runtime-check-exception", phase });
        }
        if (result?.ok) return result;
        return recordFailure(result, phase);
      },
      async check(phase = "runtime-check") {
        if (failure) return failure;
        const synchronous = this.checkSync(phase);
        if (!synchronous?.ok) return synchronous;
        if (!checkInFlight) {
          checkInFlight = (async () => {
            try {
              return await ping(phase);
            } catch (error) {
              return classifyExtensionRuntimeFailure(error, { source: "runtime-check-exception", phase });
            }
          })().finally(() => {
            checkInFlight = null;
          });
        }
        const result = await checkInFlight;
        if (failure) return failure;
        if (result?.ok) return result;
        return recordFailure(result, phase);
      },
      fail(result, phase = "runtime-check") {
        return recordFailure(result, phase);
      },
      isAborted() {
        return !!failure;
      },
      getFailure() {
        return failure;
      },
      onAbort(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        if (failure) {
          try { listener(failure); } catch {}
        }
        return () => listeners.delete(listener);
      },
      notify() {
        if (!failure || notified) return false;
        notified = true;
        notifyUser(failure);
        return true;
      }
    };
  }

  async function checkRuntimeGuard(runtimeGuard, phase) {
    if (!runtimeGuard?.check) return { ok: true, phase };
    return runtimeGuard.check(phase);
  }

  async function awaitWithRuntimeGuard(operation, runtimeGuard, phase, options = {}) {
    if (!runtimeGuard?.check) return operation;
    const intervalMs = Number.isFinite(options.intervalMs)
      ? Math.max(1, options.intervalMs)
      : RUNTIME_POLL_INTERVAL_MS;
    const tracked = Promise.resolve(operation).then(
      value => ({ settled: true, value }),
      error => ({ settled: true, error })
    );

    while (true) {
      const outcome = await Promise.race([
        tracked,
        sleep(intervalMs).then(() => null)
      ]);
      if (outcome?.settled) {
        if (outcome.error) throw outcome.error;
        return outcome.value;
      }
      const runtimeStatus = await checkRuntimeGuard(runtimeGuard, phase);
      if (!runtimeStatus?.ok) {
        try { await options.onRuntimeFailure?.(runtimeStatus); } catch {}
        return runtimeStatus;
      }
    }
  }

  function htmlExpectedNamesForCandidate(candidate, expectedNames = []) {
    const names = [];
    const addName = (value) => {
      const name = safeDownloadName(value);
      if (/\.html?$/i.test(name) && !names.includes(name)) names.push(name);
    };

    if (candidate?.name) addName(candidate.name);
    expectedNames.forEach(addName);
    return names;
  }

  async function beginHtmlDownloadWatch(expectedNames) {
    return sendExtensionMessage({
      type: "begin-html-download-watch",
      expectedNames,
      startedAt: Date.now()
    }, { phase: "html-download-watch-start" });
  }

  async function awaitHtmlDownloadWatch(watchId) {
    return sendExtensionMessage({
      type: "await-html-download-watch",
      watchId
    }, { phase: "html-download-watch-await" });
  }

  async function cancelHtmlDownloadWatch(watchId) {
    if (!watchId) return { ok: true };
    return sendExtensionMessage({
      type: "cancel-html-download-watch",
      watchId
    }, { phase: "html-download-watch-cancel" });
  }

  async function captureDownloadedHtmlFallback(fallbackCandidates, expectedNames = [], options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const candidate = fallbackCandidates
      .filter(canClickDownloadCandidate)
      .filter(item => isExactDownloadControl(item.node) || hasDownloadAttribute(item.node))
      .sort((a, b) => downloadCandidateClickPriority(b) - downloadCandidateClickPriority(a))[0];
    const downloadedFiles = [];
    const failures = [];
    let clickedFallback = 0;

    if (!candidate) {
      return { downloadedFiles, clickedFallback, failures };
    }

    const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "html-download-watch-start");
    if (!runtimeStatus?.ok) {
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: runtimeStatus
      };
    }

    const watchNames = htmlExpectedNamesForCandidate(candidate, expectedNames);
    const watch = await awaitWithRuntimeGuard(
      beginHtmlDownloadWatch(watchNames),
      runtimeGuard,
      "html-download-watch-start",
      { intervalMs: options.runtimePollIntervalMs }
    );
    if (isExtensionRuntimeFailure(watch)) {
      runtimeGuard?.fail?.(watch, "html-download-watch-start");
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: runtimeGuard?.getFailure?.() || watch
      };
    }
    let watchId = watch?.watchId || "";

    if (!watch?.ok || !watchId) {
      failures.push({ name: candidate.name, reason: watch?.error || "download watch failed to start" });
      watchId = "";
    }

    if (!watchId) {
      return { downloadedFiles, clickedFallback, failures };
    }

    const beforePrompt = await checkRuntimeGuard(runtimeGuard, "html-download-prompt");
    if (!beforePrompt?.ok) {
      try { await cancelHtmlDownloadWatch(watchId); } catch {}
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: beforePrompt
      };
    }

    const restore = revealDownloadCandidate(candidate);
    alert(t("htmlDownloadActionRequired"));
    try { candidate.node?.focus?.({ preventScroll: true }); } catch {}
    clickedFallback++;
    debugLog("waiting for user HTML download fallback", {
      name: candidate.name,
      watchId,
      priority: downloadCandidateClickPriority(candidate)
    });

    let result;
    try {
      result = await awaitWithRuntimeGuard(
        awaitHtmlDownloadWatch(watchId),
        runtimeGuard,
        "html-download-watch-wait",
        { onRuntimeFailure: () => cancelHtmlDownloadWatch(watchId) }
      );
    } finally {
      restore();
    }
    if (isExtensionRuntimeFailure(result)) {
      runtimeGuard?.fail?.(result, "html-download-watch-wait");
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: runtimeGuard?.getFailure?.() || result
      };
    }
    if (result?.ok && result.download) {
      const download = result.download;
      downloadedFiles.push({
        name: safeDownloadName(download.name || candidate.name),
        sourcePath: download.sourcePath,
        downloadId: download.id,
        startTime: download.startTime,
        endTime: download.endTime
      });
      debugLog("captured Chrome downloads fallback", {
        name: download.name,
        sourcePath: download.sourcePath,
        downloadId: download.id
      });
    } else {
      failures.push({ name: candidate.name, reason: result?.error || "download watch did not capture HTML file" });
    }

    return { downloadedFiles, clickedFallback, failures };
  }

  async function extractDownloadFiles(btn, expectedNames = [], answerText = "", options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "html-artifact-start");
    if (!runtimeStatus?.ok) {
      return {
        files: [],
        downloadedFiles: [],
        candidatesCount: 0,
        clickedFallback: 0,
        failures: [],
        warnings: [],
        runtimeUnavailable: true,
        runtimeFailure: runtimeStatus
      };
    }
    const container = closestArtifactContainer(btn);
    await revealCollapsedGeneratedArtifacts(container);
    const candidates = getDownloadCandidates(container, expectedNames);
    const files = [];
    const downloadedFiles = [];
    const failures = [];
    const warnings = [];
    const fallbackCandidates = [];
    let clickedFallback = 0;

    debugLog("download candidates found", { count: candidates.length });

    for (const candidate of candidates) {
      debugLog("download candidate", {
        name: candidate.name,
        scheme: hrefScheme(candidate.href),
        href: candidate.href ? candidate.href.slice(0, 120) : ""
      });

      try {
        const file = await readDownloadCandidate(candidate);
        pushUniqueFile(files, file);
        debugLog("download content extraction succeeded", { name: file.name, bytes: file.content.length });
      } catch (error) {
        const reason = error?.message || String(error);
        failures.push({ name: candidate.name, scheme: hrefScheme(candidate.href), reason });
        debugLog("download content extraction failed", { name: candidate.name, scheme: hrefScheme(candidate.href), reason });
        if (canClickDownloadCandidate(candidate)) {
          fallbackCandidates.push(candidate);
        }
      }
    }

    for (const previewFile of await readHtmlPreviews(container, expectedNames, candidates)) {
      pushUniqueFile(files, previewFile);
    }

    const interactiveFiles = await readInteractiveHtmlArtifacts(container, expectedNames, candidates);
    warnings.push(...(interactiveFiles.warnings || []));
    for (const artifactFile of interactiveFiles) {
      pushUniqueFile(files, artifactFile);
    }

    for (const codeBlockFile of extractHtmlCodeBlockFiles(answerText, expectedNames)) {
      pushUniqueFile(files, codeBlockFile);
    }

    const validated = validateCapturedHtmlFiles(files);
    warnings.push(...validated.warnings);
    const safeFiles = validated.files;

    if (files.length === 0 && safeFiles.length === 0) {
      const fallback = await captureDownloadedHtmlFallback(fallbackCandidates, expectedNames, {
        runtimeGuard,
        runtimePollIntervalMs: options.runtimePollIntervalMs
      });
      if (fallback.runtimeUnavailable) {
        return {
          files: safeFiles,
          downloadedFiles,
          candidatesCount: candidates.length,
          clickedFallback,
          failures,
          warnings,
          runtimeUnavailable: true,
          runtimeFailure: fallback.runtimeFailure || runtimeGuard?.getFailure?.() || null
        };
      }
      downloadedFiles.push(...fallback.downloadedFiles);
      clickedFallback += fallback.clickedFallback;
      failures.push(...fallback.failures);
    }

    const actualHtmlRows = collectArtifactFileRows(container, ["html", "htm"]);
    const capturedNames = new Set([
      ...safeFiles.map(file => file.name.toLowerCase()),
      ...downloadedFiles.map(file => file.name.toLowerCase())
    ]);
    const missingRows = Array.from(new Set(actualHtmlRows.map(row => row.name)))
      .filter(name => !capturedNames.has(name.toLowerCase()));
    if (missingRows.length) {
      warnings.push(`HTML file cards without safely captured content: ${missingRows.join(", ")}`);
    }

    debugLog("attachment extraction result", {
      attachmentsLength: safeFiles.length,
      downloadedAttachmentsLength: downloadedFiles.length,
      candidatesCount: candidates.length,
      clickedFallback,
      failures,
      warnings
    });

    return {
      files: safeFiles,
      downloadedFiles,
      candidatesCount: candidates.length,
      clickedFallback,
      failures,
      warnings
    };
  }

  function convertGeneratedHtmlToMarkdown(text) {
    if (!text) return "";

    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
    const candidate = (fenced ? fenced[1] : trimmed).trim();
    const looksLikeHtml = /^<\s*(?:article|aside|blockquote|body|div|h[1-6]|html|main|ol|p|section|table|ul)\b/i.test(candidate);

    if (!looksLikeHtml) return text;

    const converted = htmlToMarkdown(candidate);
    return converted && converted.length > 10 ? converted : text;
  }

  function cleanAnswerText(text) {
    if (!text) return "";
    const lines = text.split(/\r?\n/).filter(l => !/^obsidian:\/\/\S+/i.test(l.trim()));
    return removeEmptyMarkdownLinkTargets(lines.join("\n")).trim();
  }

  function removeInternalAttachmentMarkers(text) {
    return String(text || "").replace(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g, "GPT_OBSIDIAN_ATTACHMENTS").trim();
  }

  function cleanQuestionText(text) {
    if (!text) return "";
    return text
      .replace(/\s*더 보기\s*간단히\s*$/g, "")
      .replace(/\s*더 보기\s*$/g, "")
      .trim();
  }

  function findPrevUserMessageText(fromEl) {
    const selected = getUserSelection();
    if (selected) return cleanQuestionText(selected);
    const nodes = getAllMessageNodes();
    const container = closestMessageContainer(fromEl);
    const idx = findMessageNodeIndex(nodes, container);
    for (let i = idx - 1; i >= 0; i--) {
      const el = nodes[i];
      if (getMessageRole(el) === "user") {
        return questionNodeToPlainText(el);
      }
    }
    return "";
  }

  async function readClipboardSafe() {
    try { return await navigator.clipboard.readText(); } catch { return ""; }
  }

  function requestVisualizeShareConsent({ requestPermission = requestClipboardReadPermission, consentMode = "visualize" } = {}) {
    const isProviderNeutralRichApp = consentMode === "rich-app-continuation" || consentMode === "previous-qa-rich-app";
    const isConversationShare = consentMode === "conversation";
    return new Promise(resolve => {
      let host = null;
      let continueButton = null;
      let cancelButton = null;
      let keyHandler = null;
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        try { continueButton?.removeEventListener?.("click", continueHandler); } catch {}
        try { cancelButton?.removeEventListener?.("click", cancelHandler); } catch {}
        try { keyHandler && globalThis.removeEventListener?.("keydown", keyHandler, true); } catch {}
        try { host?.remove?.(); } catch {}
        host = null;
        continueButton = null;
        cancelButton = null;
        keyHandler = null;
        resolve({
          approved: result?.approved === true,
          permissionGranted: result?.permissionGranted === true
        });
      };
      const cancelHandler = event => {
        event?.preventDefault?.();
        finish({ approved: false, permissionGranted: false });
      };
      const continueHandler = event => {
        event?.preventDefault?.();
        if (settled) return;
        if (continueButton) continueButton.disabled = true;
        let permissionPromise;
        try {
          // This call must stay synchronous inside the extension-owned button
          // click so Chrome can associate the optional permission with it.
          permissionPromise = Promise.resolve(requestPermission());
        } catch {
          permissionPromise = Promise.resolve(false);
        }
        permissionPromise.then(
          granted => finish({ approved: true, permissionGranted: granted === true }),
          () => finish({ approved: true, permissionGranted: false })
        );
      };

      try {
        host = document.createElement("div");
        host.setAttribute("data-gpt2obs-visualize-consent", "true");
        const shadow = host.attachShadow?.({ mode: "closed" });
        if (!shadow) throw new Error("shadow-root-unavailable");
        shadow.innerHTML = `
          <style>
            :host { all: initial; }
            .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: rgba(0,0,0,.58); font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
            .panel { width: min(620px, calc(100vw - 32px)); max-height: min(720px, calc(100vh - 32px)); overflow: auto; box-sizing: border-box; border-radius: 14px; background: #fff; color: #111; padding: 22px; box-shadow: 0 18px 70px rgba(0,0,0,.38); }
            h2 { margin: 0 0 12px; font-size: 20px; }
            p { margin: 0; white-space: pre-wrap; line-height: 1.5; font-size: 14px; }
            .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
            button { border: 1px solid #999; border-radius: 8px; padding: 9px 14px; background: #fff; color: #111; font: inherit; cursor: pointer; }
            button[data-gpt2obs-consent-continue] { border-color: #111; background: #111; color: #fff; }
            button:disabled { cursor: wait; opacity: .65; }
          </style>
          <div class="backdrop" role="presentation">
            <section class="panel" role="dialog" aria-modal="true" aria-labelledby="gpt2obs-consent-title">
              <h2 id="gpt2obs-consent-title"></h2>
              <p data-gpt2obs-consent-body></p>
              <div class="actions">
                <button type="button" data-gpt2obs-consent-cancel></button>
                <button type="button" data-gpt2obs-consent-continue></button>
              </div>
            </section>
          </div>`;
        shadow.querySelector("#gpt2obs-consent-title").textContent = t(
          isConversationShare
            ? "conversationShareConsentTitle"
            : isProviderNeutralRichApp
              ? "richAppConsentTitle"
              : "visualizeConsentTitle"
        );
        shadow.querySelector("[data-gpt2obs-consent-body]").textContent = t(
          isConversationShare
            ? "conversationShareConfirm"
            : isProviderNeutralRichApp
              ? "richAppShareConfirm"
              : "visualizeShareConfirm"
        );
        continueButton = shadow.querySelector("[data-gpt2obs-consent-continue]");
        cancelButton = shadow.querySelector("[data-gpt2obs-consent-cancel]");
        continueButton.textContent = t("visualizeConsentContinue");
        cancelButton.textContent = t("visualizeConsentCancel");
        continueButton.addEventListener("click", continueHandler);
        cancelButton.addEventListener("click", cancelHandler);
        keyHandler = event => {
          if (event?.key === "Escape") cancelHandler(event);
        };
        globalThis.addEventListener?.("keydown", keyHandler, true);
        (document.body || document.documentElement).appendChild(host);
        continueButton.focus?.();
      } catch {
        finish({ approved: false, permissionGranted: false });
      }
    });
  }

  // An existing whole-conversation link can be stale when the current
  // assistant response was added after the link was created. Keep this
  // approval separate from the initial share consent so an Update action is
  // never performed implicitly. Callers may inject a confirmation function in
  // tests; production uses the page's native confirmation surface because no
  // clipboard permission is involved in this second decision.
  function requestConversationShareUpdateConsent({ confirmFn = globalThis.confirm } = {}) {
    let approved = false;
    try {
      approved = typeof confirmFn === "function" && confirmFn(t("conversationShareUpdateConfirm")) === true;
    } catch {
      approved = false;
    }
    return Promise.resolve({ approved });
  }

  function requestManualVisualizeShareUrl() {
    return new Promise(resolve => {
      let host = null;
      let input = null;
      let form = null;
      let keyHandler = null;
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        if (input) input.value = "";
        try { form?.removeEventListener?.("submit", submitHandler); } catch {}
        try { keyHandler && globalThis.removeEventListener?.("keydown", keyHandler, true); } catch {}
        try { host?.remove?.(); } catch {}
        host = null;
        input = null;
        form = null;
        keyHandler = null;
        resolve(String(value || ""));
      };
      const submitHandler = event => {
        event?.preventDefault?.();
        const value = String(input?.value || "");
        const validated = validateStrictChatGptShareUrl(value);
        const error = form?.querySelector?.("[data-gpt2obs-manual-error]");
        if (!validated) {
          if (error) {
            error.textContent = t("visualizeManualShareInvalid");
            error.hidden = false;
          }
          return;
        }
        finish(validated);
      };

      try {
        host = document.createElement("div");
        host.setAttribute("data-gpt2obs-manual-share", "true");
        const shadow = host.attachShadow?.({ mode: "closed" });
        if (!shadow) throw new Error("shadow-root-unavailable");
        shadow.innerHTML = `
          <style>
            :host { all: initial; }
            .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: rgba(0,0,0,.58); font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
            .panel { width: min(560px, calc(100vw - 32px)); box-sizing: border-box; border-radius: 14px; background: #fff; color: #111; padding: 22px; box-shadow: 0 18px 70px rgba(0,0,0,.38); }
            h2 { margin: 0 0 10px; font-size: 20px; } p { margin: 0 0 14px; line-height: 1.45; }
            input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #777; border-radius: 8px; font-size: 15px; }
            .error { color: #b42318; min-height: 1.4em; margin-top: 8px; font-size: 13px; }
            .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
            button { border: 1px solid #999; border-radius: 8px; padding: 9px 14px; background: #fff; color: #111; font: inherit; cursor: pointer; }
            button[type="submit"] { border-color: #111; background: #111; color: #fff; }
          </style>
          <div class="backdrop" role="presentation">
            <form class="panel" aria-labelledby="gpt2obs-manual-title">
              <h2 id="gpt2obs-manual-title"></h2>
              <p data-gpt2obs-manual-body></p>
              <input type="url" autocomplete="off" spellcheck="false" value="" required />
              <div class="error" data-gpt2obs-manual-error hidden></div>
              <div class="actions">
                <button type="button" data-gpt2obs-manual-cancel></button>
                <button type="submit" data-gpt2obs-manual-save></button>
              </div>
            </form>
          </div>`;
        shadow.querySelector("#gpt2obs-manual-title").textContent = t("visualizeManualShareTitle");
        shadow.querySelector("[data-gpt2obs-manual-body]").textContent = t("visualizeManualShareBody");
        shadow.querySelector("[data-gpt2obs-manual-save]").textContent = t("visualizeManualShareSave");
        shadow.querySelector("[data-gpt2obs-manual-cancel]").textContent = t("visualizeManualShareCancel");
        input = shadow.querySelector("input");
        input.placeholder = t("visualizeManualSharePlaceholder");
        form = shadow.querySelector("form");
        form.addEventListener("submit", submitHandler);
        shadow.querySelector("[data-gpt2obs-manual-cancel]").addEventListener("click", () => finish(""), { once: true });
        keyHandler = event => {
          if (event?.key === "Escape") {
            event.preventDefault?.();
            finish("");
          }
        };
        globalThis.addEventListener?.("keydown", keyHandler, true);
        (document.body || document.documentElement).appendChild(host);
        input.focus?.();
      } catch {
        try { host?.remove?.(); } catch {}
        host = null;
        const promptFn = typeof globalThis.prompt === "function" ? globalThis.prompt : null;
        if (!promptFn) {
          finish("");
          return;
        }
        let value = "";
        try { value = promptFn(t("visualizeManualShareBody"), "") || ""; } catch {}
        finish(value);
      }
    });
  }

  function visualizeShareFailureMessage(result, mode = "") {
    const failureKey = mode === "conversation"
      ? "conversationShareFailedPrefix"
      : mode === "rich-app-continuation" || mode === "previous-qa-rich-app"
        ? "richAppShareFailedPrefix"
        : "visualizeShareFailedPrefix";
    return formatI18nTemplate(t(failureKey), {
      stage: result?.stage || "unknown",
      reason: result?.reason || "unknown error"
    });
  }

  async function handleVisualizeShareSave({
    btn,
    currentAssistantNode,
    previousQa,
    visualizeContext = null,
    runtimeGuard,
    sourceUrl = location.href,
    confirmFn = globalThis.confirm,
    alertFn = globalThis.alert,
    preflightFn = prepareVisualizeSharePreflight,
    createShareLinkFn = createOrReuseVisualizeShareLink,
    requestClipboardReadPermissionFn = requestClipboardReadPermission,
    requestShareConsentFn = requestVisualizeShareConsent,
    requestConversationShareUpdateConsentFn = requestConversationShareUpdateConsent,
    sharePlan = null,
    shareCapabilityPreflight = false,
    preflightOptions = {},
    shareOptions = {},
    extractDownloadFilesFn = extractDownloadFiles,
    saveObsidianNoteFn = saveObsidianNote
  } = {}) {
    // Keep share state outside the failure renderer so failures after a
    // successful Create/Update action can report the exact state without
    // losing the validated URL.
    let shareSource = "";
    let shareCreatedThisAttempt = false;
    let shareUpdatedThisAttempt = false;
    let validatedShareUrl = "";
    let shareInteraction = "";
    let conversationShareActionOccurred = false;
    const showFailure = (result, afterShare = false) => {
      let failure = result || { ok: false, stage: "unknown", reason: "unknown error" };
      if (afterShare) {
        failure = {
          ...failure,
          shareKind: failure.shareKind || effectiveShareKind,
          shareSource: failure.shareSource || shareSource,
          shareCreatedThisAttempt: failure.shareCreatedThisAttempt === true || shareCreatedThisAttempt,
          shareUpdatedThisAttempt: failure.shareUpdatedThisAttempt === true || shareUpdatedThisAttempt,
          validatedShareUrl: failure.validatedShareUrl || validatedShareUrl,
          shareInteraction: failure.shareInteraction || shareInteraction,
          conversationShareActionOccurred: failure.conversationShareActionOccurred === true || conversationShareActionOccurred
        };
      }
      const failureMode = failure?.shareKind === "conversation"
        ? "conversation"
        : failure?.mode || preflight?.mode || visualizeContext?.mode || "";
      try { alertFn(visualizeShareFailureMessage(failure, failureMode)); } catch {}
      if (afterShare && (failure?.shareCreatedThisAttempt || failure?.shareUpdatedThisAttempt || failure?.conversationShareActionOccurred)) {
        const isConversation = failure?.shareKind === "conversation";
        const warningKey = isConversation
          ? (failure?.shareInteraction === "instant-copy"
            ? "conversationShareCopiedButSaveFailed"
            : (failure?.validatedShareUrl ? "conversationShareChangedButSaveFailed" : "conversationShareChangeAttemptUnverified"))
          : (failure?.validatedShareUrl ? "visualizeShareCreatedButSaveFailed" : "visualizeShareCreateAttemptUnverified");
        try { alertFn(t(warningKey)); } catch {}
      }
      return failure;
    };

    let preflight;
    try {
      preflight = await preflightFn({
        ...preflightOptions,
        currentAssistantNode,
        previousQa,
        visualizeContext,
        sourceUrl,
        btn,
        runtimeGuard
      });
    } catch (error) {
      return showFailure({ ok: false, stage: "preflight", reason: error?.message || String(error) });
    }
    if (!preflight?.ok) return showFailure(preflight || { ok: false, stage: "preflight", reason: "preflight failed" });

    const effectiveMode = preflight.mode || visualizeContext?.mode || "previous-qa";
    let resolvedSharePlan = sharePlan;
    if (shareCapabilityPreflight) {
      if (!resolvedSharePlan || resolvedSharePlan.status !== "found") {
        try {
          resolvedSharePlan = resolveVisualizeShareTriggerPlan(currentAssistantNode, {
            root: shareOptions.root || document
          });
        } catch (error) {
          resolvedSharePlan = { status: "unavailable", kind: "none", reason: error?.message || "share capability resolution failed" };
        }
      }
      if (resolvedSharePlan?.status !== "found" || !resolvedSharePlan?.control) {
        const capabilityMode = resolvedSharePlan?.kind === "conversation" ? "conversation" : effectiveMode;
        return showFailure({
          ok: false,
          stage: "share-button",
          reason: resolvedSharePlan?.reason || "no unambiguous share trigger is available",
          mode: effectiveMode,
          shareKind: capabilityMode === "conversation" ? "conversation" : "response"
        });
      }
    }
    const effectiveShareKind = resolvedSharePlan?.kind === "conversation" ? "conversation" : "response";
    const effectivePreviousQa = effectiveMode === "previous-qa" || effectiveMode === "previous-qa-rich-app"
      ? (previousQa || visualizeContext || null)
      : null;
    const targetTurnId = String(preflight.targetTurnId || currentAssistantNode?.closest?.("[data-testid^='conversation-turn-']")?.getAttribute?.("data-turn-id") || "").trim();
    if (effectiveShareKind === "conversation") {
      const conversationDraft = buildConversationShareMarkdownDraft({
        title: preflight.title,
        sourceUrl,
        bodyMode: effectiveMode,
        questionText: preflight.questionText || visualizeContext?.questionText || effectivePreviousQa?.questionText || "",
        answerText: effectivePreviousQa?.answerText || preflight.answerText || "",
        explanationText: preflight.explanationText || visualizeContext?.explanationText || "",
        targetTurnId,
        richArtifactsExpected: preflight.richArtifactsExpected
      });
      if (!conversationDraft) {
        return showFailure({
          ok: false,
          stage: "preflight",
          reason: "conversation share Markdown could not be assembled",
          mode: effectiveMode,
          shareKind: "conversation"
        });
      }
    }
    const preflightOverall = combineCaptureIntegrity(preflight.fileIntegrity, preflight.localRichIntegrity);
    let allowPartialAttachments = false;
    let allowPartialRich = false;
    const preSaveKey = `${sourceUrl}::visualize-share::${preflight.title}::${preflight.richArtifactsExpected}`;
    if (state.activeSaves.has(preSaveKey) || isDuplicateContentSave(preSaveKey)) return { ok: false, stage: "duplicate", reason: "duplicate save suppressed" };
    state.activeSaves.add(preSaveKey);
    let saveSucceeded = false;
    let saveAttempted = false;
    let verifiedHydratedA2ShareRelocation = false;
    let verifiedHydratedA2ShareSurface = null;
    const validateHydratedShareContext = (phase = "", boundaryContext = {}) => {
      if (!visualizeContext?.hydratedFromVirtualizedTurns) return { ok: true };
      const shareSurface = boundaryContext?.shareSurface || null;
      const responseSurfaceTransition = !!shareSurface &&
        boundaryContext?.shareKind === "response" &&
        phase !== "share-button";
      const verifiedPostCopyClosedSurface = responseSurfaceTransition &&
        !!verifiedHydratedA2ShareSurface &&
        shareSurface === verifiedHydratedA2ShareSurface &&
        (shareSurface?.isConnected === false || !shareSurfaceVisibilityDetails(shareSurface).visible) &&
        boundaryContext?.copyClicked === true &&
        boundaryContext?.copySignalObserved === true;
      const visibleCopySuccessSurface = responseSurfaceTransition &&
        shareSurface?.isConnected !== false &&
        shareSurfaceVisibilityDetails(shareSurface).visible &&
        !isCurrentVisibleFinalShareSurface(shareSurface) &&
        boundaryContext?.copyClicked === true &&
        boundaryContext?.copySignalObserved === true;
      const a2ShareTransition = responseSurfaceTransition
        ? verifiedPostCopyClosedSurface
          ? verifiedHydratedA2ShareRelocation
            ? { mode: "verified", shareKind: "response" }
            : null
          : visibleCopySuccessSurface
            ? {
              mode: "copy-success-surface",
              shareKind: "response",
              surface: shareSurface,
              copyClicked: true,
              copySignalObserved: true
            }
            : { mode: "surface", shareKind: "response", surface: shareSurface }
        : verifiedHydratedA2ShareRelocation
          ? { mode: "verified", shareKind: "response" }
          : null;
      const status = revalidateHydratedVisualizeContext(
        currentAssistantNode,
        visualizeContext,
        {
          root: shareOptions.root || document,
          a2ShareTransition
        }
      );
      if (status?.ok && responseSurfaceTransition) {
        verifiedHydratedA2ShareSurface = shareSurface;
        if (status.a2ShareRelocationVerified === true) {
          verifiedHydratedA2ShareRelocation = true;
        }
      }
      return status;
    };
    try {
      if (!preflightOverall.complete) {
        const allowPartial = confirmIncompleteCaptureSave(preflightOverall, confirmFn);
        if (!allowPartial) return { ok: false, stage: "preflight", reason: "incomplete file or local rich capture was cancelled" };
        allowPartialAttachments = !preflight.fileIntegrity.complete;
        allowPartialRich = !preflight.localRichIntegrity.complete;
      }

      let consentResult;
      let consentBoundaryFailure = null;
      let deferredHydrationRecovery = false;
      const guardedClipboardPermissionRequest = () => {
        const runtimeSyncStatus = runtimeGuard?.checkSync
          ? runtimeGuard.checkSync("visualize-consent-permission")
          : { ok: true };
        if (!runtimeSyncStatus?.ok) {
          consentBoundaryFailure = {
            ok: false,
            stage: "runtime",
            reason: runtimeSyncStatus.error || "runtime unavailable"
          };
          return false;
        }
        const hydratedContextStatus = validateHydratedShareContext();
        if (!hydratedContextStatus.ok) {
          if (hydratedContextStatus.retryableMissingHydrationWindow === true ||
              hydratedContextStatus.retryableMissingQ2 === true) {
            deferredHydrationRecovery = true;
            return false;
          }
          consentBoundaryFailure = {
            ok: false,
            stage: "preflight",
            reason: hydratedContextStatus.reason || "hydrated Visualize context changed before clipboard permission"
          };
          return false;
        }
        return requestClipboardReadPermissionFn();
      };
      try {
        consentResult = await requestShareConsentFn({
          requestPermission: guardedClipboardPermissionRequest,
          consentMode: effectiveShareKind === "conversation" ? "conversation" : effectiveMode
        });
      } catch (error) {
        return showFailure({ ok: false, stage: "share-confirm", reason: error?.message || "Visualize share consent UI failed" });
      }
      if (consentBoundaryFailure) {
        return showFailure({
          ...consentBoundaryFailure,
          mode: effectiveMode,
          shareKind: effectiveShareKind
        });
      }
      if (consentResult?.approved !== true) {
        return { ok: false, stage: "share-confirm", reason: "user cancelled Visualize share consent" };
      }
      const clipboardPermissionGranted = deferredHydrationRecovery
        ? false
        : consentResult.permissionGranted === true;
      const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "visualize-share-before-click");
      if (!runtimeStatus?.ok) return showFailure({ ok: false, stage: "runtime", reason: runtimeStatus.error || "runtime unavailable" });
      let finalHydratedContext = validateHydratedShareContext();
      if (!finalHydratedContext.ok && (
        finalHydratedContext.retryableMissingHydrationWindow === true ||
        finalHydratedContext.retryableMissingQ2 === true ||
        (deferredHydrationRecovery && finalHydratedContext.verifiedHydrationRemount === true)
      )) {
        finalHydratedContext = await recoverHydratedVisualizeMissingQ2(
          currentAssistantNode,
          visualizeContext,
          {
            root: shareOptions.root || document,
            runtimeGuard,
            allowVerifiedHydrationRemount: deferredHydrationRecovery
          }
        );
        if (finalHydratedContext.ok && finalHydratedContext.recoveredQ2 === true && shareCapabilityPreflight) {
          let refreshedSharePlan;
          try {
            refreshedSharePlan = resolveVisualizeShareTriggerPlan(currentAssistantNode, {
              root: shareOptions.root || document
            });
          } catch (error) {
            refreshedSharePlan = {
              status: "unavailable",
              kind: "none",
              reason: error?.message || "share capability refresh failed after hydrated Q2 recovery"
            };
          }
          const refreshedShareKind = refreshedSharePlan?.kind === "conversation" ? "conversation" : "response";
          if (refreshedSharePlan?.status !== "found" || !refreshedSharePlan?.control) {
            finalHydratedContext = {
              ok: false,
              reason: refreshedSharePlan?.reason || "share trigger could not be refreshed after hydrated Q2 recovery"
            };
          } else if (refreshedShareKind !== effectiveShareKind) {
            finalHydratedContext = {
              ok: false,
              reason: "share scope changed after hydrated Q2 recovery"
            };
          } else {
            resolvedSharePlan = refreshedSharePlan;
          }
        }
      }
      if (finalHydratedContext.ok && deferredHydrationRecovery &&
          finalHydratedContext.recoveredQ2 !== true && shareCapabilityPreflight) {
        let refreshedSharePlan;
        try {
          refreshedSharePlan = resolveVisualizeShareTriggerPlan(currentAssistantNode, {
            root: shareOptions.root || document
          });
        } catch (error) {
          refreshedSharePlan = {
            status: "unavailable",
            kind: "none",
            reason: error?.message || "share capability refresh failed after deferred hydrated Q2 recovery"
          };
        }
        const refreshedShareKind = refreshedSharePlan?.kind === "conversation" ? "conversation" : "response";
        if (refreshedSharePlan?.status !== "found" || !refreshedSharePlan?.control) {
          finalHydratedContext = {
            ok: false,
            reason: refreshedSharePlan?.reason || "share trigger could not be refreshed after deferred hydrated Q2 recovery"
          };
        } else if (refreshedShareKind !== effectiveShareKind) {
          finalHydratedContext = {
            ok: false,
            reason: "share scope changed after deferred hydrated Q2 recovery"
          };
        } else {
          resolvedSharePlan = refreshedSharePlan;
        }
      }
      if (!finalHydratedContext.ok) {
        return showFailure({
          ok: false,
          stage: "preflight",
          reason: finalHydratedContext.reason || "hydrated Visualize context changed before Share",
          mode: effectiveMode,
          shareKind: effectiveShareKind
        });
      }
      if (effectiveMode === "previous-qa-rich-app") {
        const finalRichAppPreflight = revalidatePreviousQaRichAppContext(currentAssistantNode, visualizeContext);
        if (!finalRichAppPreflight.ok) {
          return showFailure({
            ok: false,
            stage: "preflight",
            reason: finalRichAppPreflight.reason || "provider-neutral rich app evidence disappeared before Share",
            mode: effectiveMode,
            shareKind: effectiveShareKind
          });
        }
      }

      let shareResult;
      try {
        shareResult = await createShareLinkFn(currentAssistantNode, {
          ...shareOptions,
          runtimeGuard,
          root: shareOptions.root || document,
          shareKind: effectiveShareKind,
          shareTrigger: resolvedSharePlan?.control || shareOptions.shareTrigger,
          requestConversationShareUpdateConsent: shareOptions.requestConversationShareUpdateConsent || requestConversationShareUpdateConsentFn,
          shareRoot: shareOptions.shareRoot || (effectiveShareKind === "conversation"
            ? (shareOptions.root || document)
            : closestArtifactContainer(btn) || currentAssistantNode),
          validateShareContext: visualizeContext?.hydratedFromVirtualizedTurns
            ? validateHydratedShareContext
            : shareOptions.validateShareContext,
          clipboardPermissionGranted
        });
      } catch (error) {
        return showFailure({ ok: false, stage: "share-button", reason: error?.message || String(error) });
      }
      if (!shareResult?.ok) {
        const failedShareResult = shareResult || { ok: false, stage: "share-url", reason: "share link creation failed" };
        return showFailure({
          ...failedShareResult,
          shareKind: failedShareResult.shareKind || effectiveShareKind,
          shareSource: failedShareResult.shareSource || failedShareResult.source || "",
          shareCreatedThisAttempt: failedShareResult.shareCreatedThisAttempt === true,
          shareUpdatedThisAttempt: failedShareResult.shareUpdatedThisAttempt === true,
          validatedShareUrl: validateStrictChatGptShareUrl(failedShareResult.validatedShareUrl || failedShareResult.url || "")
        }, true);
      }
      shareSource = shareResult.source === "created" ? "created" : "existing";
      shareCreatedThisAttempt = shareSource === "created";
      shareUpdatedThisAttempt = shareResult.shareUpdatedThisAttempt === true;
      shareInteraction = String(shareResult.shareInteraction || "").trim();
      conversationShareActionOccurred = shareResult.conversationShareActionOccurred === true;
      // The create helper normally returns its own strict-validated URL, but
      // keep this boundary defensive for injected/custom helpers as well:
      // relative paths or raw clipboard-like strings must never reach the
      // Markdown/frontmatter builder.
      validatedShareUrl = validateStrictChatGptShareUrl(shareResult.validatedShareUrl || shareResult.url || "");
      if (!validatedShareUrl) {
        return showFailure({ ok: false, stage: "share-url", reason: "share flow returned an invalid ChatGPT share URL", shareSource, shareCreatedThisAttempt, validatedShareUrl }, true);
      }

      let attachments = Array.isArray(preflight.readableFiles) ? preflight.readableFiles.slice() : [];
      let downloadedAttachments = [];
      let downloadedMarkdown = null;
      let extractionWarnings = [];
      const expectedFiles = preflight.fileIntegrity?.expectedDeliverableNames || [];
      if (expectedFiles.length) {
        const extraction = await extractDownloadFilesFn(
          btn,
          expectedFiles,
          effectiveMode === "direct-visualize" || effectiveMode === "rich-app-continuation"
            ? (preflight.explanationText || extractDirectVisualizeExplanation(currentAssistantNode))
            : effectivePreviousQa?.answerText || "",
          { runtimeGuard }
        );
        if (extraction.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
          return showFailure({
            ok: false,
            stage: "file-capture",
            reason: extraction.runtimeFailure?.error || runtimeGuard?.getFailure?.()?.error || "file capture runtime failed",
            shareSource,
            shareCreatedThisAttempt,
            validatedShareUrl
          }, true);
        }
        const extractedFiles = Array.isArray(extraction.files) ? extraction.files : [];
        attachments = extractedFiles.length ? extractedFiles : attachments;
        downloadedAttachments = Array.isArray(extraction.downloadedFiles) ? extraction.downloadedFiles : [];
        extractionWarnings = Array.from(new Set([...(extraction.warnings || []), ...(extraction.failures || []).map(item => `${item?.name || "file"}: ${item?.reason || "capture failed"}`)]));
      }

      const finalFileIntegrity = assessArtifactIntegrity({
        fileLinks: preflight.fileLinks,
        artifactRows: preflight.artifactRows,
        attachments,
        downloadedAttachments,
        generatedMarkdown: {},
        failures: []
      });
      if (!finalFileIntegrity.complete && !allowPartialAttachments) {
        return showFailure({
          ok: false,
          stage: "file-capture",
          reason: `file completeness changed after preflight: ${(finalFileIntegrity.missingNames || []).join(", ") || "unknown file"}`,
          shareSource,
          shareCreatedThisAttempt,
          validatedShareUrl
        }, true);
      }
      if (extractionWarnings.length) {
        try { alertFn(t("generatedArtifactWarningPrefix") + extractionWarnings.join("\n")); } catch {}
      }

      let noteAnswerText = effectivePreviousQa?.answerText || "";
      if (allowPartialRich && (effectiveMode === "previous-qa" || effectiveMode === "previous-qa-rich-app")) {
        noteAnswerText = [buildMissingRichArtifactWarning(preflight.localRichIntegrity), noteAnswerText].filter(Boolean).join("\n\n");
      }
      const attachmentNames = finalFileIntegrity.expectedHtmlNames;
      const attachmentMarker = attachments.length || downloadedAttachments.length ? "%%GPT_OBSIDIAN_ATTACHMENTS%%" : "";
      const markdown = effectiveShareKind === "conversation"
        ? buildConversationShareMarkdown({
          title: preflight.title,
          sourceUrl,
          shareUrl: validatedShareUrl,
          bodyMode: effectiveMode,
          questionText: preflight.questionText || visualizeContext?.questionText || effectivePreviousQa?.questionText || "",
          answerText: noteAnswerText,
          explanationText: preflight.explanationText || visualizeContext?.explanationText || extractDirectVisualizeExplanation(currentAssistantNode),
          targetTurnId,
          attachmentMarker,
          shareInteraction,
          conversationShareFreshness: shareInteraction === "instant-copy" ? "unverified" : "",
          richArtifactsExpected: preflight.richArtifactsExpected,
          richArtifactsRemoteReferenced: preflight.richArtifactsExpected
        })
        : effectiveMode === "direct-visualize"
        ? buildDirectVisualizeShareMarkdown({
          title: preflight.title,
          sourceUrl,
          shareUrl: validatedShareUrl,
          questionText: preflight.questionText || visualizeContext?.questionText || "",
          explanationText: preflight.explanationText || visualizeContext?.explanationText || extractDirectVisualizeExplanation(currentAssistantNode),
          attachmentMarker,
          richArtifactsExpected: preflight.richArtifactsExpected,
          richArtifactsRemoteReferenced: preflight.richArtifactsExpected
        })
        : effectiveMode === "previous-qa-rich-app"
          ? buildPreviousQaRichAppShareMarkdown({
            title: preflight.title,
            sourceUrl,
            shareUrl: validatedShareUrl,
            questionText: effectivePreviousQa?.questionText || preflight.questionText || "",
            answerText: noteAnswerText,
            attachmentMarker,
            richArtifactsExpected: preflight.richArtifactsExpected,
            richArtifactsRemoteReferenced: preflight.richArtifactsExpected
          })
        : effectiveMode === "rich-app-continuation"
          ? buildRichAppContinuationShareMarkdown({
            title: preflight.title,
            sourceUrl,
            shareUrl: validatedShareUrl,
            questionText: preflight.questionText || visualizeContext?.questionText || "",
            explanationText: preflight.explanationText || visualizeContext?.explanationText || extractDirectVisualizeExplanation(currentAssistantNode),
            attachmentMarker,
            richArtifactsExpected: preflight.richArtifactsExpected,
            richArtifactsRemoteReferenced: preflight.richArtifactsExpected
          })
          : buildVisualizeShareMarkdown({
          title: preflight.title,
          sourceUrl,
          shareUrl: validatedShareUrl,
          questionText: effectivePreviousQa?.questionText || preflight.questionText || "",
          answerText: noteAnswerText,
          attachmentMarker,
          captureMode: "previous-qa-visualize-share-link",
          richArtifactsExpected: preflight.richArtifactsExpected,
          richArtifactsRemoteReferenced: preflight.richArtifactsExpected
        });
      if (!markdown) {
        return showFailure({ ok: false, stage: "markdown", reason: "final Visualize share Markdown could not be assembled", shareSource, shareCreatedThisAttempt, validatedShareUrl }, true);
      }

      const beforeNativeRuntime = await checkRuntimeGuard(runtimeGuard, "visualize-native-save");
      if (!beforeNativeRuntime?.ok) {
        return showFailure({
          ok: false,
          stage: "runtime",
          reason: beforeNativeRuntime.error || "runtime unavailable",
          shareSource,
          shareCreatedThisAttempt,
          validatedShareUrl
        }, true);
      }
      const beforeNativeContext = validateHydratedShareContext();
      if (!beforeNativeContext.ok) {
        return showFailure({
          ok: false,
          stage: "preflight",
          reason: beforeNativeContext.reason || "hydrated Visualize context changed before Native save",
          shareSource,
          shareCreatedThisAttempt,
          validatedShareUrl
        }, true);
      }
      saveAttempted = true;
      let saveResponse;
      try {
        saveResponse = await saveObsidianNoteFn({
          vaultName: settings.vaultName,
          vaultPath: settings.vaultPath,
          filePath: preflight.filePath,
          content: markdown,
          attachments,
          downloadedAttachments,
          downloadedMarkdown,
          attachmentNames,
          allowPartialAttachments,
          htmlSaveDir: settings.htmlSaveDir,
          fallbackUri: ""
        }, {
          runtimeGuard,
          showAlert: alertFn,
          validateContext: visualizeContext?.hydratedFromVirtualizedTurns
            ? validateHydratedShareContext
            : null
        });
      } catch (error) {
        return showFailure({
          ok: false,
          stage: "native-save",
          reason: error?.message || String(error),
          shareSource,
          shareCreatedThisAttempt,
          validatedShareUrl
        }, true);
      }
      if (!saveResponse?.ok) {
        return showFailure({
          ok: false,
          stage: saveResponse?.stage || "native-save",
          reason: saveResponse?.reason || saveResponse?.error || "Native helper save failed",
          shareSource,
          shareCreatedThisAttempt,
          validatedShareUrl
        }, true);
      }
      saveSucceeded = true;
      return {
        ok: true,
        mode: effectiveMode,
        shareKind: effectiveShareKind,
        shareSource,
        shareCreatedThisAttempt,
        shareUpdatedThisAttempt,
        validatedShareUrl,
        shareInteraction,
        conversationShareActionOccurred,
        dialogClosed: !!shareResult.dialogClosed,
        saveResponse
      };
    } finally {
      state.activeSaves.delete(preSaveKey);
      if (!saveSucceeded) clearContentSaveReservation(preSaveKey);
      if (saveAttempted && !saveSucceeded && (shareCreatedThisAttempt || shareUpdatedThisAttempt || conversationShareActionOccurred)) {
        debugLog("ChatGPT share link remained active after Native save failure", {
          shareSource,
          shareCreatedThisAttempt,
          shareUpdatedThisAttempt,
          shareInteraction,
          conversationShareActionOccurred,
          hasValidatedShareUrl: !!validatedShareUrl
        });
      }
    }
  }

  async function handleCopyClick(btn, options = {}) {
    const preferClipboard = !!options.preferClipboard;
    const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 80;
    const run = async () => {
      if (!isCurrentGeneration()) return;
      const runtimeGuard = options.runtimeGuard || createRuntimeGuard();
      const confirmFn = options.confirmFn || globalThis.confirm;
      const alertFn = options.alertFn || globalThis.alert;
      const runtimeSyncStatus = runtimeGuard.checkSync("save-start");
      if (!runtimeSyncStatus?.ok) {
        runtimeGuard.notify();
        return;
      }
      // Start the real background ping immediately, but do not await it before
      // the generated-file card receives the originating user click. Every
      // download/native boundary below awaits this same in-flight preflight.
      void runtimeGuard.check("save-start");
      let currentAssistantNode = closestMessageContainer(btn);
      let actionButton = btn;
      const pendingVisualizeAttemptKey = visualizeAttemptKeyForNode(currentAssistantNode);
      if (pendingVisualizeAttemptKey && state.activeVisualizeAttempts.has(pendingVisualizeAttemptKey)) {
        return { ok: false, stage: "duplicate", reason: "Visualize save attempt already in progress" };
      }
      const richExpected = collectRichAppBlockCandidates(currentAssistantNode);
      const previousQaFinder = options.findPreviousQaPairFn || findPreviousQaPair;
      let previousQaCandidate = null;
      if (options.findPreviousQaPairFn) {
        try { previousQaCandidate = options.findPreviousQaPairFn(currentAssistantNode); } catch {}
      }
      const messageNodes = getAllMessageNodes();
      const currentIndex = findMessageNodeIndex(messageNodes, currentAssistantNode);
      const previousRequest = findPreviousMessageByRole(messageNodes, currentIndex, "user")?.node || previousQaCandidate?.requestNode || null;
      const structuredVisualizeCandidate = isVisualizeShareCandidate(currentAssistantNode, { requestNode: previousRequest });
      if (structuredVisualizeCandidate) {
        const attemptKey = pendingVisualizeAttemptKey;
        if (attemptKey && state.activeVisualizeAttempts.has(attemptKey)) {
          return { ok: false, stage: "duplicate", reason: "Visualize save attempt already in progress" };
        }
        if (attemptKey) state.activeVisualizeAttempts.add(attemptKey);
        try {
          let visualizeContext = null;
          try {
            visualizeContext = options.findPreviousQaPairFn
              ? resolveVisualizeSaveContext(currentAssistantNode)
              : await resolveVisualizeSaveContextWithHydration(currentAssistantNode, {
                ...(options.visualizeHydrationOptions || {}),
                runtimeGuard
              });
          } catch (error) {
            visualizeContext = { mode: "unresolved", reason: error?.message || "Visualize context resolution failed" };
          }
          // Test callers and older integrations may provide an explicit finder
          // for a detached fixture. Keep that override narrowly scoped; the
          // production path never falls back from a failed direct resolution to
          // an unrelated earlier Q/A pair.
          if (visualizeContext?.mode === "unresolved" && options.findPreviousQaPairFn) {
            if (!previousQaCandidate) {
              try { previousQaCandidate = previousQaFinder(currentAssistantNode); } catch {}
            }
            if (previousQaCandidate?.questionText && previousQaCandidate?.answerText && previousQaCandidate?.answerNode) {
              visualizeContext = {
                mode: "previous-qa",
                questionNode: previousQaCandidate.questionNode || null,
                answerNode: previousQaCandidate.answerNode,
                visualizeRequestNode: previousQaCandidate.requestNode,
                visualizeAnswerNode: currentAssistantNode,
                questionText: previousQaCandidate.questionText,
                answerText: previousQaCandidate.answerText
              };
            }
          }
          if (!visualizeContext || visualizeContext.mode === "unresolved") {
            const failure = { ok: false, stage: "preflight", reason: visualizeContext?.reason || "Visualize Q1/A1 pair could not be resolved" };
            if (runtimeGuard?.isAborted?.()) runtimeGuard.notify?.();
            try { alertFn(visualizeShareFailureMessage(failure)); } catch {}
            return failure;
          }

          if (visualizeContext.visualizeAnswerNode) {
            const answerNodeChanged = visualizeContext.visualizeAnswerNode !== currentAssistantNode;
            currentAssistantNode = visualizeContext.visualizeAnswerNode;
            if (answerNodeChanged || visualizeContext.hydratedFromVirtualizedTurns) {
              const liveButtons = Array.from(currentAssistantNode.querySelectorAll?.(".gpt2obs-btn") || [])
                .filter(candidate => candidate?.isConnected !== false && currentAssistantNode.contains?.(candidate));
              actionButton = liveButtons.length === 1 ? liveButtons[0] : currentAssistantNode;
            }
          }
          const resolvedPreviousQa = visualizeContext.mode === "previous-qa"
            ? {
              questionNode: visualizeContext.questionNode,
              answerNode: visualizeContext.answerNode,
              requestNode: visualizeContext.visualizeRequestNode,
              questionText: visualizeContext.questionText,
              answerText: visualizeContext.answerText
            }
            : null;
          return await handleVisualizeShareSave({
            btn: actionButton,
            currentAssistantNode,
            previousQa: resolvedPreviousQa,
            visualizeContext,
            runtimeGuard,
            sourceUrl: location.href,
            confirmFn,
            alertFn,
            preflightFn: options.preflightFn || prepareVisualizeSharePreflight,
            createShareLinkFn: options.createShareLinkFn || createOrReuseVisualizeShareLink,
            requestClipboardReadPermissionFn: options.requestClipboardReadPermissionFn || requestClipboardReadPermission,
            requestShareConsentFn: options.requestShareConsentFn || requestVisualizeShareConsent,
            requestConversationShareUpdateConsentFn: options.requestConversationShareUpdateConsentFn || requestConversationShareUpdateConsent,
            shareCapabilityPreflight: typeof options.createShareLinkFn !== "function",
            preflightOptions: options.preflightOptions || {},
            shareOptions: options.shareOptions || {},
            extractDownloadFilesFn: options.extractDownloadFilesFn || extractDownloadFiles,
            saveObsidianNoteFn: options.saveObsidianNoteFn || saveObsidianNote
          });
        } finally {
          if (attemptKey) state.activeVisualizeAttempts.delete(attemptKey);
        }
      }
      let previousQaRichAppContext = null;
      try {
        previousQaRichAppContext = resolvePreviousQaRichAppSaveContext(currentAssistantNode);
      } catch (error) {
        previousQaRichAppContext = { mode: "unresolved", reason: error?.message || "provider-neutral previous-Q&A rich app resolution failed" };
      }
      if (previousQaRichAppContext?.mode === "previous-qa-rich-app") {
        const resolvedPreviousQa = {
          questionNode: previousQaRichAppContext.questionNode,
          answerNode: previousQaRichAppContext.answerNode,
          requestNode: previousQaRichAppContext.requestNode,
          questionText: previousQaRichAppContext.questionText,
          answerText: previousQaRichAppContext.answerText
        };
        return handleVisualizeShareSave({
          btn,
          currentAssistantNode,
          previousQa: resolvedPreviousQa,
          visualizeContext: previousQaRichAppContext,
          runtimeGuard,
          sourceUrl: location.href,
          confirmFn,
          alertFn,
          preflightFn: options.preflightFn || prepareVisualizeSharePreflight,
          createShareLinkFn: options.createShareLinkFn || createOrReuseVisualizeShareLink,
          requestClipboardReadPermissionFn: options.requestClipboardReadPermissionFn || requestClipboardReadPermission,
          requestShareConsentFn: options.requestShareConsentFn || requestVisualizeShareConsent,
          requestConversationShareUpdateConsentFn: options.requestConversationShareUpdateConsentFn || requestConversationShareUpdateConsent,
          shareCapabilityPreflight: typeof options.createShareLinkFn !== "function",
          preflightOptions: options.preflightOptions || {},
          shareOptions: options.shareOptions || {},
          extractDownloadFilesFn: options.extractDownloadFilesFn || extractDownloadFiles,
          saveObsidianNoteFn: options.saveObsidianNoteFn || saveObsidianNote
        });
      }
      let continuationContext = null;
      try { continuationContext = resolveRichAppContinuationContext(currentAssistantNode); } catch (error) {
        continuationContext = { mode: "unresolved", reason: error?.message || "rich app continuation resolution failed" };
      }
      if (continuationContext?.mode === "rich-app-continuation") {
        return handleVisualizeShareSave({
          btn,
          currentAssistantNode,
          previousQa: null,
          visualizeContext: continuationContext,
          runtimeGuard,
          sourceUrl: location.href,
          confirmFn,
          alertFn,
          preflightFn: options.preflightFn || prepareVisualizeSharePreflight,
          createShareLinkFn: options.createShareLinkFn || createOrReuseVisualizeShareLink,
          requestClipboardReadPermissionFn: options.requestClipboardReadPermissionFn || requestClipboardReadPermission,
          requestShareConsentFn: options.requestShareConsentFn || requestVisualizeShareConsent,
          requestConversationShareUpdateConsentFn: options.requestConversationShareUpdateConsentFn || requestConversationShareUpdateConsent,
          shareCapabilityPreflight: typeof options.createShareLinkFn !== "function",
          preflightOptions: options.preflightOptions || {},
          shareOptions: options.shareOptions || {},
          extractDownloadFilesFn: options.extractDownloadFilesFn || extractDownloadFiles,
          saveObsidianNoteFn: options.saveObsidianNoteFn || saveObsidianNote
        });
      }
      let answerText = preferClipboard ? await readClipboardSafe() : "";
      // If clipboard is just an Obsidian test URI, prefer DOM extraction.
      if (answerText && /^obsidian:\/\/\S+/i.test(answerText.trim())) {
        answerText = "";
      }
      // Prefer HTML→Markdown conversion to preserve structure
      answerText = htmlOrClipboardToMarkdown(btn, answerText, preferClipboard);
      if (!answerText || answerText.length < 3) {
        // final fallback: plain text from DOM
        const clone = currentAssistantNode?.cloneNode(true);
        normalizeFileCitationChips(clone);
        removeUnsupportedRichAppBlocks(clone);
        removeNonAnswerChrome(clone);
        answerText = clone?.innerText?.trim() || "";
      }
      answerText = convertGeneratedHtmlToMarkdown(answerText);
      answerText = repairFencedCodeBlocks(answerText);
      const questionText = findPrevUserMessageText(btn);
      answerText = cleanAnswerText(answerText);
      answerText = stripChatGptFooterLines(answerText);
      const preSaveKey = `${location.href}::${answerText.length}::rich-${richExpected.length}::${questionText.slice(0, 120)}`;
      if (state.activeSaves.has(preSaveKey)) return;
      if (isDuplicateContentSave(preSaveKey)) return;
      state.activeSaves.add(preSaveKey);
      let saveAttempted = false;
      try {
      const artifactContainer = closestArtifactContainer(btn) || currentAssistantNode;
      const generatedMarkdown = await extractGeneratedMarkdownArtifact(artifactContainer, { runtimeGuard });
      if (generatedMarkdown.runtimeUnavailable || runtimeGuard.isAborted()) {
        runtimeGuard.fail(generatedMarkdown.runtimeFailure || runtimeGuard.getFailure(), "markdown-artifact");
        runtimeGuard.notify();
        return;
      }
      const hintedAttachmentNames = filenamesFromText(answerText);
      const extraction = await extractDownloadFiles(btn, hintedAttachmentNames, answerText, { runtimeGuard });
      if (extraction.runtimeUnavailable || runtimeGuard.isAborted()) {
        runtimeGuard.fail(extraction.runtimeFailure || runtimeGuard.getFailure(), "html-artifact");
        runtimeGuard.notify();
        return;
      }
      const attachments = extraction.files;
      const downloadedAttachments = extraction.downloadedFiles;
      const hasRealHtmlAttachment = attachments.length > 0 || downloadedAttachments.length > 0;
      const downloadedMarkdown = generatedMarkdown.downloadedMarkdown || null;
      const hasDetailedMarkdown = !!generatedMarkdown.markdown || !!downloadedMarkdown;
      const previousQa = (settings.usePreviousQaForHtml && hasRealHtmlAttachment)
        ? previousQaFinder(currentAssistantNode)
        : null;
      const fileLinks = collectFileLikeLinks(artifactContainer);
      const artifactRows = collectArtifactFileRows(artifactContainer, FILE_DELIVERABLE_EXTENSIONS);
      const fileIntegrity = assessArtifactIntegrity({
        fileLinks,
        artifactRows,
        attachments,
        downloadedAttachments,
        generatedMarkdown,
        failures: extraction.failures
      });
      const storedRichExpected = collectRichArtifactCandidatesForStoredNote(currentAssistantNode, {
        previousQa,
        usePreviousQaForHtml: !!settings.usePreviousQaForHtml && hasRealHtmlAttachment
      });
      const richIntegrity = assessRichArtifactIntegrity({ expected: storedRichExpected, captures: [] });
      const overallIntegrity = combineCaptureIntegrity(fileIntegrity, richIntegrity);
      let allowPartialAttachments = false;
      let allowPartialRich = false;
      if (!overallIntegrity.complete) {
        const allowPartialSave = confirmIncompleteCaptureSave(overallIntegrity, confirmFn);
        if (!allowPartialSave) {
          debugLog("save cancelled because capture was incomplete", overallIntegrity);
          return;
        }
        allowPartialAttachments = !fileIntegrity.complete;
        allowPartialRich = !richIntegrity.complete;
      }
      const attachmentNames = fileIntegrity.expectedHtmlNames;
      const extractionWarnings = Array.from(new Set([
        ...(generatedMarkdown.warnings || []),
        ...(extraction.warnings || []),
        ...(fileIntegrity.failureDetails || [])
      ].filter(Boolean)));
      if (!hasRealHtmlAttachment && extraction.clickedFallback > 0) {
        alertFn(t("htmlArtifactCaptureFailedWarning"));
      }
      if (extractionWarnings.length) {
        alertFn(t("generatedArtifactWarningPrefix") + extractionWarnings.join("\n"));
      }
      const useOriginalQaHeadings = !!previousQa;
      let noteQuestionText = previousQa?.questionText || questionText;
      let noteAnswerText = previousQa?.answerText || answerText;
      if (hasRealHtmlAttachment) {
        noteQuestionText = removeInternalAttachmentMarkers(noteQuestionText);
        noteAnswerText = removeInternalAttachmentMarkers(noteAnswerText);
      }
      const captureMetadata = allowPartialRich ? {
        captureStatus: "partial",
        richArtifactsExpected: richIntegrity.expectedCount,
        richArtifactsComplete: richIntegrity.completeCount
      } : null;
      if (allowPartialRich) {
        noteAnswerText = [buildMissingRichArtifactWarning(richIntegrity), noteAnswerText]
          .filter(Boolean)
          .join("\n\n");
      }
      const title = makeTitle(noteQuestionText || noteAnswerText);
      const filePath = buildFilePath(title);
      const attachmentMarker = hasRealHtmlAttachment ? "%%GPT_OBSIDIAN_ATTACHMENTS%%" : "";
      const baseMd = hasRealHtmlAttachment
        ? buildHtmlLearningMarkdown({
          title,
          questionText: noteQuestionText,
          answerText: noteAnswerText,
          url: location.href,
          attachmentMarker,
          useOriginalHeadings: useOriginalQaHeadings,
          captureMetadata
        })
        : buildMarkdown({title, questionText: noteQuestionText, answerText: noteAnswerText, url: location.href, attachmentMarker: "", captureMetadata});
      const md = removeEmptyMarkdownLinkTargets(generatedMarkdown.markdown
        ? mergeDetailedMarkdownSection(baseMd, generatedMarkdown.markdown)
        : downloadedMarkdown
          ? mergeDownloadedDetailedMarkdownMarker(baseMd)
          : baseMd);
      const fallbackBaseMd = hasRealHtmlAttachment
        ? buildHtmlLearningMarkdown({
          title,
          questionText: noteQuestionText,
          answerText: noteAnswerText,
          url: location.href,
          attachmentMarker: "",
          useOriginalHeadings: useOriginalQaHeadings,
          captureMetadata
        })
        : md;
      const fallbackMd = removeEmptyMarkdownLinkTargets(generatedMarkdown.markdown
        ? mergeDetailedMarkdownSection(fallbackBaseMd, generatedMarkdown.markdown)
        : fallbackBaseMd);
      const uri = buildObsidianURI({vault: settings.vaultName, file: filePath, content: fallbackMd});
      const requiresNativeSave = hasRealHtmlAttachment || hasDetailedMarkdown;
      debugLog("save mode", {
        mode: requiresNativeSave ? "native" : "uri",
        attachmentsLength: attachments.length,
        downloadedAttachmentsLength: downloadedAttachments.length,
        generatedMarkdownName: generatedMarkdown.name,
        generatedMarkdownLength: generatedMarkdown.markdown.length,
        downloadedMarkdownName: downloadedMarkdown?.name || "",
        usePreviousQaForHtml: !!settings.usePreviousQaForHtml,
        usedPreviousQaNote: useOriginalQaHeadings,
        usedHtmlLearningLayout: hasRealHtmlAttachment,
        candidatesCount: extraction.candidatesCount,
        failures: extraction.failures,
        warnings: extractionWarnings,
        richArtifactsExpected: richIntegrity.expectedCount,
        richArtifactsComplete: richIntegrity.completeCount,
        allowPartialRich
      });
      saveAttempted = true;
      if (requiresNativeSave) {
        await saveObsidianNote({
          vaultName: settings.vaultName,
          vaultPath: settings.vaultPath,
          filePath,
          content: md,
          attachments,
          downloadedAttachments,
          downloadedMarkdown,
          attachmentNames,
          allowPartialAttachments,
          htmlSaveDir: settings.htmlSaveDir,
          fallbackUri: hasDetailedMarkdown ? "" : uri
        }, { runtimeGuard, showAlert: alertFn });
      } else {
        openObsidianURI(uri);
      }
      } finally {
        state.activeSaves.delete(preSaveKey);
        if (!saveAttempted) clearContentSaveReservation(preSaveKey);
      }
    };

    if (delayMs > 0) {
      return new Promise(resolve => {
        setTimeout(() => resolve(run()), delayMs);
      });
    }
    return run();
  }

  function injectOwnButtons() {
    const msgs = getAllMessageNodes().filter(message => getMessageRole(message) === "assistant");
    msgs.forEach(m => {
      const existing = m.querySelector('.gpt2obs-btn');
      if (existing?.dataset?.gpt2obsVersion === VERSION) {
        if (existing.dataset.gpt2obsBusy !== "true") {
          existing.textContent = t("saveButton");
        }
        return;
      }
      if (existing) existing.remove();
      const toolbarHost = m.querySelector('header, footer, [role="toolbar"]') || m;
      const btn = document.createElement('button');
      btn.textContent = t("saveButton");
      btn.className = "gpt2obs-btn";
      btn.dataset.gpt2obsVersion = VERSION;
      btn.style.cssText = "margin-left:8px;padding:4px 8px;border:1px solid #888;border-radius:6px;background:#f6f6f6;cursor:pointer;font-size:12px;";
      btn.addEventListener('click', () => {
        if (btn.dataset.gpt2obsBusy === "true") return;
        btn.dataset.gpt2obsBusy = "true";
        btn.disabled = true;
        btn.textContent = t("savingButton");
        Promise.resolve(handleCopyClick(btn, {
          preferClipboard: false,
          delayMs: 0
        })).catch(error => {
          console.warn("Failed to save ChatGPT response.", error);
        }).finally(() => {
          if (!btn.isConnected) return;
          btn.dataset.gpt2obsBusy = "false";
          btn.disabled = false;
          btn.textContent = t("saveButton");
        });
      });
      toolbarHost.appendChild(btn);
    });
  }

  function watchAssistantMessages() {
    const attach = (root=document) => {
      injectOwnButtons();
    };
    const mo = new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(n => {
            if (n.nodeType === 1) attach(n);
          });
        }
      });
    });
    mo.observe(document.documentElement, {childList:true, subtree:true});
    attach();
  }

  if (globalThis.__GPT_OBSIDIAN_ENABLE_TEST_HOOKS__) {
    globalThis.__GPT_OBSIDIAN_TEST_HOOKS__ = {
      VERSION,
      getMessageRole,
      closestArtifactContainer,
      findPreviousMessageByRole,
      findPreviousQaPair,
      questionNodeToPlainText,
      isPreviousAnswerVisualizationRequestText,
      resolveVisualizeSaveContext,
      resolveVisualizeSaveContextWithHydration,
      revalidateHydratedVisualizeContext,
      recoverHydratedVisualizeMissingQ2,
      visualizeAttemptKeyForNode,
      getActiveVisualizeAttemptKeys: () => Array.from(state.activeVisualizeAttempts),
      resolveConversationScrollContainer,
      resolvePreviousQaRichAppSaveContext,
      resolveRichAppContinuationContext,
      buildMarkdown,
      buildHtmlLearningMarkdown,
      visualizeShareMetadata,
      conversationShareMetadata,
      buildVisualizeShareReferenceWarning,
      buildConversationShareWarning,
      buildVisualizeShareMarkdownDraft,
      buildConversationShareMarkdownDraft,
      buildVisualizeShareMarkdown,
      buildConversationShareMarkdown,
      buildDirectVisualizeShareMarkdown,
      buildPreviousQaRichAppShareMarkdownDraft,
      buildPreviousQaRichAppShareMarkdown,
      buildRichAppContinuationShareMarkdownDraft,
      buildRichAppContinuationShareMarkdown,
      buildDirectVisualizeShareMarkdownDraft,
      prepareVisualizeSharePreflight,
      captureMetadataFrontmatterLines,
      buildFilePath,
      makeTitle,
      cleanQuestionText,
      cleanAnswerText,
      decodePercentEncodedRuns,
      normalizeChatGptShareUrl,
      validateStrictChatGptShareUrl,
      extractValidatedChatGptShareUrl,
      isVisualizeRequestNode,
      isExplicitVisualizeRequestNode,
      hasEarlierAssistantResponseVariant,
      isVisualizeRequestForAssistant,
      isVisualizeShareCandidate,
      getVisibleShareDialogs,
      getShareSurfaceCandidates,
      waitForRelevantShareDialog,
      isWholeConversationShareCopySuccessText,
      conversationShareCopySignalEntries,
      captureConversationShareCopySignals,
      waitForConversationShareOutcome,
      findCreateShareLinkButton,
      findCopyShareLinkButton,
      findCloseShareDialogButton,
      captureCopySuccessState,
      waitForCopySuccess,
      resolveShareUrlFromCopySurface,
      resolveShareUrlFromInstantCopy,
      requestManualVisualizeShareUrl,
      requestVisualizeShareConsent,
      requestConversationShareUpdateConsent,
      waitForValidatedShareUrl,
      waitForUpdatedConversationShareUrl,
      createOrReuseVisualizeShareLink,
      filenameFromArtifactText,
      filenamesFromArtifactText,
      filenameFromText,
      collectFileLikeLinks,
      assessArtifactIntegrity,
      confirmPartialArtifactSave,
      collectRichAppBlockCandidates,
      isStrictRichAppRuntimeIframeUrl,
      resolveProviderNeutralRichAppEvidence,
      collectRichArtifactCandidatesForStoredNote,
      assessRichArtifactIntegrity,
      combineCaptureIntegrity,
      confirmIncompleteCaptureSave,
      buildMissingRichArtifactWarning,
      removeUnsupportedRichAppBlocks,
      isInsideUnsupportedRichAppBlock,
      normalizeFileCitationChips,
      isDecorativeContentImage,
      htmlToMarkdown,
      removeEmptyMarkdownLinkTargets,
      elementVisibilityDetails,
      isVisibleEnabledControl,
      resolveResponseShareTrigger,
      resolveConversationShareTrigger,
      resolveVisualizeShareTriggerPlan,
      findResponseShareButton,
      choosePreferredArtifactRow,
      resolveArtifactFileRow,
      collectArtifactFileRows,
      revealCollapsedGeneratedArtifacts,
      selectGeneratedMarkdownArtifact,
      generatedMarkdownRegionRoot,
      generatedMarkdownRegionsEquivalent,
      collapseEquivalentGeneratedMarkdownRegions,
      collectGeneratedMarkdownRegions,
      captureGeneratedMarkdownRegionSnapshot,
      markdownCandidatesFromGeneratedRegion,
      findGeneratedMarkdownRegionCandidate,
      waitForGeneratedMarkdownRegion,
      clickArtifactControl,
      startGeneratedMarkdownDownloadCapture,
      readGeneratedMarkdownArtifactRow,
      extractGeneratedMarkdownArtifact,
      normalizeMarkdownForComparison,
      mergeDetailedMarkdownSection,
      mergeDownloadedDetailedMarkdownMarker,
      hasNearbyArtifactViewer,
      isLikelyInteractiveHtmlFileCard,
      isExactDownloadControl,
      downloadCandidateClickPriority,
      getDownloadCandidates,
      findUserActivatedDownloadCandidate,
      extractCompleteHtmlSource,
      findScopedArtifactFilename,
      collectInteractiveArtifactDescriptors,
      hasInteractiveHtmlArtifactCandidate,
      readInteractiveHtmlArtifacts,
      readHtmlPreviews,
      validateCapturedHtmlFiles,
      extractDownloadFiles,
      classifyExtensionRuntimeFailure,
      isExtensionRuntimeFailure,
      checkExtensionRuntimeSynchronously,
      sendExtensionMessage,
      requestClipboardReadPermission,
      pingExtensionRuntime,
      pingNativeHelper,
      createRuntimeGuard,
      checkRuntimeGuard,
      awaitWithRuntimeGuard,
      saveObsidianNote,
      isDuplicateContentSave,
      clearContentSaveReservation,
      openObsidianURIDirectly,
      handleVisualizeShareSave,
      handleCopyClick,
      setTestLanguage(language) {
        settings.uiLanguage = normalizeLanguage(language);
      }
    };
  }

  watchAssistantMessages();
})();
