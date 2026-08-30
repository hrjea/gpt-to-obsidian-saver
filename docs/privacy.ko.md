# 개인정보

GPT to Obsidian Saver는 local-first이며 사용자가 직접 실행한 저장 동작만 처리합니다.

## 처리되는 정보

사용자가 Save to Obsidian을 클릭하면 확장 프로그램은 노트를 만들기 위해 필요한 ChatGPT 메시지와 주변 대화 맥락을 읽습니다. 또한 페이지에서 읽을 수 있는 HTML 또는 생성된 상세 Markdown artifact를 현재 assistant turn에서 확인하고, 페이지 추출이 불가능하면 현재 저장 동작에 정확히 대응하는 다운로드 하나를 확인할 수 있습니다.

대화 텍스트는 브라우저 확장 프로그램 안에서 로컬로 처리됩니다. 현재 ChatGPT 페이지 URL은 Markdown frontmatter의 note source로 기록될 수 있습니다.

지원되는 상호작용형 앱 답변에서는 별도의 명시적 동의를 받은 ChatGPT 공유 절차를 제안할 수 있습니다. 이 동작은 ChatGPT에 호스팅되는 공유링크를 생성·갱신·재사용하거나 복사할 수 있습니다. Obsidian 노트에는 엄격하게 검증된 ChatGPT 공유 URL만 원격 참조로 저장되며, 앱의 오프라인 복사본을 뜻하지 않습니다. 전체 대화 공유 fallback은 응답 단위 링크보다 범위가 넓으므로 별도 동의를 요구합니다.

## 설정 저장

확장 프로그램 설정은 Chrome extension storage에 저장됩니다.

- 언어, vault 이름, 저장 폴더, 기능 toggle 같은 일반 설정은 `chrome.storage.sync`를 사용합니다.
- `vaultPath`와 `htmlSaveDir` 같은 machine-specific 설정은 `chrome.storage.local`을 사용합니다.

## Downloads Permission

`downloads` permission은 현재 저장 동작에 연결된 bounded watch에서 예상한 `.html`, `.htm` 또는 생성된 `.md` 파일을 식별하는 데만 사용됩니다. 정확히 일치하는 그 파일만 로컬 native helper가 설정된 Obsidian vault용으로 복사하거나 읽을 수 있습니다.

확장 프로그램은 Downloads 폴더의 다른 파일을 스캔, 업로드, 전송하지 않습니다.

## 선택적 Clipboard Permission

선택적 `clipboardRead` permission은 사용자가 원격 참조 공유 절차를 명시적으로 승인한 경우에만 요청할 수 있습니다. 확장 프로그램은 현재 동작에 대한 새롭고 엄격한 복사 성공 신호가 확인된 뒤 clipboard 값을 최대 한 번 읽습니다. 원시 clipboard/manual 값은 로그나 저장소에 남기지 않으며, 엄격한 ChatGPT 공유 URL 검증을 통과한 값만 노트에 들어갑니다.

## 로컬 저장

데이터는 다음 방식으로 로컬에 저장됩니다.

- `obsidian://` URI를 사용하는 Obsidian URI mode
- 설정된 vault path 안에 파일을 쓰는 로컬 native helper를 사용하는 Chrome Native Messaging

## 이 확장 프로그램이 추가하지 않는 것

- Analytics 없음
- Telemetry 없음
- Tracking 없음
- Developer server 없음
- 사용자 데이터 판매 없음
- 확장 프로그램이 수행하는 노트, vault 파일, 다운로드 첨부파일, 로그의 원격 업로드 없음. 일반 설정은 Chrome sync storage를 사용하므로 사용자의 브라우저/계정 설정에 따라 Chrome이 동기화할 수 있습니다.

위에 설명한 명시적 ChatGPT Share 절차가 현재 유일한 원격 공유 예외입니다. 이 절차는 개발자 서버가 아니라 ChatGPT의 화면 UI와 서비스를 사용합니다. 공유링크를 생성하거나 갱신한 뒤 Obsidian 저장이 실패하면 링크가 계속 활성 상태일 수 있습니다. 확장 프로그램은 이를 경고하며 자동으로 공유를 해제하지 않습니다.

이 문서는 확장 프로그램의 동작을 설명합니다. Chrome, ChatGPT, Obsidian, 운영체제는 이 확장 프로그램과 별개의 네트워크 및 개인정보 동작을 가질 수 있습니다.
