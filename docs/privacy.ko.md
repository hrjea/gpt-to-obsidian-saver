# 개인정보

GPT to Obsidian Saver는 local-first이며 사용자가 직접 실행한 저장 동작만 처리합니다.

## 처리되는 정보

사용자가 Save to Obsidian을 클릭하면 확장 프로그램은 노트를 만들기 위해 필요한 ChatGPT 메시지와 주변 대화 맥락을 읽습니다. HTML 학습자료 노트의 경우 현재 assistant 메시지에서 페이지가 읽을 수 있는 HTML artifact 또는 즉시 발생한 HTML 다운로드를 확인할 수 있습니다.

대화 텍스트는 브라우저 확장 프로그램 안에서 로컬로 처리됩니다. 현재 ChatGPT 페이지 URL은 Markdown frontmatter의 note source로 기록될 수 있습니다.

## 설정 저장

확장 프로그램 설정은 Chrome extension storage에 저장됩니다.

- 언어, vault 이름, 저장 폴더, 기능 toggle 같은 일반 설정은 `chrome.storage.sync`를 사용합니다.
- `vaultPath`와 `htmlSaveDir` 같은 machine-specific 설정은 `chrome.storage.local`을 사용합니다.

## Downloads Permission

`downloads` permission은 사용자가 Save to Obsidian을 클릭한 직후 다운로드된 HTML 파일을 식별하는 데만 사용됩니다. 그 특정 `.html` 또는 `.htm` 파일은 native helper를 통해 설정된 Obsidian vault로 복사될 수 있습니다.

확장 프로그램은 Downloads 폴더의 다른 파일을 스캔, 업로드, 전송하지 않습니다.

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
- 이 확장 프로그램이 수행하는 third-party storage 없음
- 노트, vault 파일, 다운로드 첨부파일, 설정, 로그의 원격 업로드 없음

이 문서는 확장 프로그램의 동작을 설명합니다. Chrome, ChatGPT, Obsidian, 운영체제는 이 확장 프로그램과 별개의 네트워크 및 개인정보 동작을 가질 수 있습니다.
