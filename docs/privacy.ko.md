# 개인정보

GPT to Obsidian Saver는 local-first이며 사용자가 직접 실행한 저장 동작만 처리합니다.

## 처리되는 정보

사용자가 Save to Obsidian을 클릭하면 확장 프로그램은 노트를 만들기 위해 필요한 ChatGPT 메시지와 주변 대화 맥락을 읽습니다. 또한 페이지에서 읽을 수 있는 HTML 또는 생성된 상세 Markdown artifact를 현재 assistant turn에서 확인하고, 페이지 추출이 불가능하면 현재 저장 동작에 정확히 대응하는 다운로드 하나를 확인할 수 있습니다.

대화 텍스트는 브라우저 확장 프로그램 안에서 로컬로 처리됩니다. 현재 ChatGPT 페이지 URL은 Markdown frontmatter의 note source로 기록될 수 있습니다.

바로 이전 답변을 명시적으로 가리키는 Visualize 요청에서 필요한 대화 turn이 일시적으로 DOM에서 사라진 경우, 확장 프로그램은 현재 대화를 제한된 범위에서 잠시 스크롤해 인접한 가상화 창의 순서를 검증한 뒤 논리적 위치를 복원할 수 있습니다. 안정된 클릭 창에서 A2 바로 다음의 role-bearing turn이 유일하게 확인되면 그 turn의 메모리 내 identity/content fingerprint와 scroller 기준 픽셀 offset을 초기 복원 위치 계산에 한 번만 사용할 수 있습니다. 이 following-turn anchor는 노트 내용이나 대화 순서 증거가 아니며, 동의 이후 복구에는 재사용되지 않습니다. Q2/A2만 보이는 경우에는 A1/Q2 overlap 다음 Q1/A1 overlap을 모두 요구하며, 복구된 A1은 Markdown 변환용 독립 메모리 clone으로만 유지되고 ChatGPT UI 조작에는 사용되지 않습니다. 동의 중 검증된 missing-only 창이 생기면 callback 안에서는 스크롤하거나 복구하지 않고, 승인된 동의가 돌아온 뒤 정확한 원래 A2와 production conversation scroller를 유지한 채 한 번의 제한된 복구로 필요한 A1/Q2를 다시 결합할 수 있습니다. 응답 Share가 앱 iframe을 최종 surface로 이동시키는 경우에도 A2의 사전 증거와 메모리 내 source fingerprint·구조 개수만 비교합니다. turn 텍스트, identity, 변환 clone, 이동 증거, rich-app runtime 증거는 현재 저장 시도의 메모리에만 남고 로그·저장·전송되지 않으며 시도가 끝나면 폐기됩니다.

버전 1.5.52에서는 일반 Markdown, HTML 학습 자료, 생성된 상세 Markdown, 명시적으로 승인한 부분 저장을 포함한 모든 일반 저장이 Obsidian 노트를 만들기 전에 별도의 ChatGPT Share 동의를 요청합니다. 계속하면 ChatGPT에 호스팅되는 응답 공유링크를 생성·갱신·재사용하거나 복사할 수 있고, 응답 Share가 없을 때만 범위를 별도로 고지한 전체 대화 fallback을 사용할 수 있습니다. 취소하면 clipboard permission을 요청하지 않고 Share control을 클릭하지 않으며 노트를 만들지 않습니다. 엄격하게 검증된 URL은 로컬 노트에 보조 링크로 추가될 뿐, 로컬로 캡처된 본문을 rich-app 원격 참조로 바꾸지 않습니다.

지원되는 상호작용형 앱 답변에는 기존의 별도 동의형 ChatGPT Share 절차가 유지됩니다. 이 모드에서는 엄격하게 검증된 URL이 로컬에 복사되지 않은 상호작용 동작을 위한 원격 참조이므로 앱의 오프라인 복사본을 뜻하지 않습니다. 전체 대화 fallback은 응답 단위 링크보다 범위가 넓으므로 어느 흐름에서든 별도 동의를 요구합니다.

## 설정 저장

확장 프로그램 설정은 Chrome extension storage에 저장됩니다.

- 언어, vault 이름, 저장 폴더, 기능 toggle 같은 일반 설정은 `chrome.storage.sync`를 사용합니다.
- `vaultPath`와 `htmlSaveDir` 같은 machine-specific 설정은 `chrome.storage.local`을 사용합니다.

## Downloads Permission

`downloads` permission은 현재 저장 동작에 연결된 bounded watch에서 예상한 `.html`, `.htm` 또는 생성된 `.md` 파일을 식별하는 데만 사용됩니다. 정확히 일치하는 그 파일만 로컬 native helper가 설정된 Obsidian vault용으로 복사하거나 읽을 수 있습니다.

확장 프로그램은 Downloads 폴더의 다른 파일을 스캔, 업로드, 전송하지 않습니다.

## 선택적 Clipboard Permission

선택적 `clipboardRead` permission은 사용자가 일반 보조 링크 또는 특수 원격 참조 Share 절차를 명시적으로 승인한 경우에만 요청할 수 있습니다. 동의 동작에서 permission을 동기적으로 요청하기 직전에 확장 프로그램은 runtime과 해당 selected-turn proof를 다시 검증합니다. 일반 저장은 고정한 selected assistant, 가장 가까운 이전 user, 그 사이에 연속된 assistant들의 순서화된 provenance, route, 정확한 Share scope/control을 확인하고, hydrated rich-app 저장은 더 강한 conversation/app/scroller proof를 유지합니다. 불일치하면 Chrome에 permission을 요청하기 전에 중단합니다. 단, 엄격하게 검증된 missing-only 가상화 창은 permission 요청을 0회로 건너뛰고 승인된 동의가 돌아온 뒤의 제한된 복구로 넘깁니다. 동의 callback 안에서는 복구 스크롤을 하지 않으며, 건너뛴 permission을 이후 자동으로 다시 요청하지도 않습니다. 이 경우 clipboard 읽기는 비활성 상태로 유지되고 확장 프로그램이 소유한 빈 manual URL 입력창을 사용할 수 있습니다. 동의, permission 요청, clipboard 읽기, 읽은 값의 사용은 승인된 현재 시도에만 한정됩니다. permission이 있고 현재 동작에 대한 새롭고 엄격한 복사 성공 신호까지 확인된 경우에만 clipboard 값을 최대 한 번 읽습니다. Chrome이 승인한 선택적 permission 자체는 사용자나 브라우저가 취소할 때까지 유지될 수 있으며, 확장 프로그램은 이를 자동으로 제거하지 않습니다. 원시 clipboard/manual 값은 로그나 저장소에 남기지 않으며, 엄격한 ChatGPT 공유 URL 검증을 통과한 값만 노트에 들어갑니다.

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

위에 설명한 명시적 ChatGPT Share 절차들이 현재 유일한 원격 공유 예외입니다. 이 절차는 개발자 서버나 비공개 ChatGPT API가 아니라 ChatGPT의 화면 UI와 서비스를 사용합니다. 버전 1.5.52은 required/optional permission, telemetry, 원격 note 저장소, runtime/Native payload field를 새로 추가하지 않습니다. 응답 Create/Update 동작 또는 전체 대화 dialog action/instant-copy가 실행된 뒤 Obsidian 저장이 실패하면 링크가 계속 활성 상태일 수 있습니다. 확장 프로그램은 이를 경고하며 자동으로 공유를 해제하지 않습니다. 기존 응답 링크를 단순히 재사용하거나 복사한 것만으로는 이 지속 경고 상태에 들어가지 않습니다.

이 문서는 확장 프로그램의 동작을 설명합니다. Chrome, ChatGPT, Obsidian, 운영체제는 이 확장 프로그램과 별개의 네트워크 및 개인정보 동작을 가질 수 있습니다.
