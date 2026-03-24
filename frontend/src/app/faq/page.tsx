"use client";

import { useState } from "react";

interface QA {
  category: string;
  question: string;
  answer: string;
}

const qaData: QA[] = [
  // 시스템 개요
  {
    category: "시스템 개요",
    question: "zk-X509는 무엇인가요?",
    answer: "공인인증서(X.509)를 사용하여 블록체인에서 신원을 인증하는 시스템입니다. ZK proof를 통해 개인정보를 노출하지 않고 '유효한 인증서를 보유하고 있다'는 것만 증명합니다.",
  },
  {
    category: "시스템 개요",
    question: "어떤 정보가 블록체인에 올라가나요?",
    answer: "nullifier(중복 방지용 해시), CA Merkle Root, 타임스탬프, 지갑 주소만 올라갑니다. 이름, 주민번호, 인증서 내용 등 개인정보는 일절 올라가지 않습니다.",
  },
  {
    category: "시스템 개요",
    question: "Selective Disclosure가 무엇인가요?",
    answer: "국가(C), 기관(O), 부서(OU), 이름(CN) 중 원하는 항목만 선택적으로 공개할 수 있습니다. 공개된 항목은 salted hash로 on-chain에 올라가서, 검증자가 특정 값과 일치하는지 확인할 수 있습니다.",
  },

  // 인증서 & CA
  {
    category: "인증서 & CA",
    question: "어떤 인증서를 사용할 수 있나요?",
    answer: "관리자가 신뢰 CA 목록에 등록한 인증기관에서 발급한 X.509 인증서를 사용할 수 있습니다. RSA-2048, ECDSA P-256, P-384 서명을 지원합니다.",
  },
  {
    category: "인증서 & CA",
    question: "CA Merkle Root는 무엇인가요?",
    answer: "신뢰하는 CA(인증기관) 공개키들의 SHA-256 해시로 구성된 Merkle Tree의 root입니다. 컨트랙트에 이 root만 저장하고, proof 안에서 '내 CA가 이 목록에 포함되어 있다'는 것을 증명합니다. 어떤 CA인지는 공개되지 않습니다.",
  },
  {
    category: "인증서 & CA",
    question: "CA가 추가되면 기존 등록은 어떻게 되나요?",
    answer: "이미 등록된 사용자에게는 영향 없습니다. CA 추가 시 Merkle Root가 변경되므로, 새로 등록하려는 사용자만 새 root 기준으로 proof를 생성하면 됩니다.",
  },

  // 등록 & 지갑
  {
    category: "등록 & 지갑",
    question: "하나의 인증서로 여러 지갑에 등록할 수 있나요?",
    answer: "컨트랙트 배포 시 설정된 maxWalletsPerCert 값에 따라 다릅니다. 예를 들어 3으로 설정되면, wallet index 0, 1, 2로 최대 3개 지갑에 등록 가능합니다.",
  },
  {
    category: "등록 & 지갑",
    question: "등록된 지갑을 변경할 수 있나요?",
    answer: "reRegister를 사용하면 같은 인증서로 기존 지갑을 새 지갑으로 이전할 수 있습니다. 관리자 승인 없이 인증서 소유자가 직접 할 수 있습니다.",
  },
  {
    category: "등록 & 지갑",
    question: "같은 wallet index를 다른 주소로 사용하면?",
    answer: "같은 인증서 + 같은 wallet index는 같은 nullifier를 생성합니다. 이미 등록된 nullifier로 register를 시도하면 AlreadyRegistered 에러가 발생합니다. reRegister로 지갑을 변경하거나, 다른 wallet index를 사용하세요.",
  },
  {
    category: "등록 & 지갑",
    question: "인증이 만료되면 어떻게 되나요?",
    answer: "인증서의 만료일(notAfter)이 on-chain에 저장됩니다. 만료 후에는 isVerified()가 false를 반환합니다. 인증서를 갱신한 후 새 proof를 생성하여 다시 등록하면 됩니다.",
  },

  // Proof 생성
  {
    category: "Proof 생성",
    question: "Proof 종류가 왜 여러 가지인가요?",
    answer: "Execute: 로직만 검증 (가장 빠름). Core Proof: 로컬에서 검증 가능하지만 on-chain 제출 불가. Groth16 Proof: on-chain 제출용, EVM에서 검증 가능한 형태로 압축된 proof입니다.",
  },
  {
    category: "Proof 생성",
    question: "Groth16 proof 생성에 Docker가 필요한 이유는?",
    answer: "Core proof를 EVM에서 검증 가능한 Groth16 형태로 변환(wrapping)할 때 gnark라는 Go 라이브러리를 Docker 컨테이너에서 실행합니다. Apple Silicon에서는 x86 에뮬레이션이 필요합니다.",
  },
  {
    category: "Proof 생성",
    question: "proof 생성 시 --registrant는 무엇인가요?",
    answer: "proof를 제출할 지갑 주소입니다. proof 안에 바인딩되어, 다른 지갑으로는 제출할 수 없습니다. 이를 통해 front-running 공격을 방지합니다.",
  },
  {
    category: "Proof 생성",
    question: "proof에 registry 주소가 왜 필요한가요?",
    answer: "proof에 IdentityRegistry 컨트랙트 주소가 포함됩니다. 같은 proof를 다른 체인이나 다른 Registry에 재사용할 수 없도록 방지합니다.",
  },

  // 보안
  {
    category: "보안",
    question: "인증서 개인키가 블록체인에 노출되나요?",
    answer: "아닙니다. 개인키는 로컬에서 서명 생성에만 사용되고, ZK proof 안에 들어가지 않습니다. zkVM에는 서명만 전달되며, 개인키는 프로세스 메모리에도 최소 시간만 존재합니다.",
  },
  {
    category: "보안",
    question: "nullifier로 사용자를 추적할 수 있나요?",
    answer: "같은 Registry + 같은 체인에서는 같은 nullifier가 생성되어 중복 등록을 방지합니다. 하지만 다른 체인에서는 다른 nullifier가 생성되므로 크로스체인 추적은 불가능합니다.",
  },
  {
    category: "보안",
    question: "관리자가 악의적으로 행동하면?",
    answer: "관리자는 CA 등록, 폐기, 일시 정지만 가능합니다. 사용자의 개인정보를 열람하거나, 위조 등록을 만들 수 없습니다. 소유권 이전은 2단계(제안 + 수락) 방식으로 실수를 방지합니다.",
  },

  // 관리자
  {
    category: "관리자",
    question: "관리자가 할 수 있는 일은?",
    answer: "CA Merkle Root 업데이트, CRL Root 업데이트, Max Proof Age 설정, 신원 폐기(Revoke), 긴급 정지(Pause/Unpause), 소유권 이전. 모두 컨트랙트 owner만 실행 가능합니다.",
  },
  {
    category: "관리자",
    question: "CRL은 무엇인가요?",
    answer: "Certificate Revocation List — 폐기된 인증서 목록입니다. CRL Merkle Root를 설정하면 폐기된 인증서로는 등록할 수 없습니다. bytes32(0)으로 설정하면 CRL 검사가 비활성화됩니다.",
  },
  {
    category: "관리자",
    question: "maxWalletsPerCert를 변경할 수 있나요?",
    answer: "아닙니다. 배포 시 설정되는 immutable 값이라 변경하려면 컨트랙트를 재배포해야 합니다.",
  },
];

const categories = [...new Set(qaData.map((q) => q.category))];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? qaData.filter((q) => q.category === filter) : qaData;

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-8 w-full flex-1 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">시스템 안내 & FAQ</h1>
        <p className="text-zinc-400 text-sm mt-1">zk-X509 시스템에 대한 자주 묻는 질문</p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter(null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            !filter ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
          }`}
        >
          전체
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filter === cat ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Q&A List */}
      <div className="space-y-2">
        {filtered.map((qa, i) => {
          const globalIndex = qaData.indexOf(qa);
          const isOpen = openIndex === globalIndex;
          return (
            <div key={globalIndex} className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded whitespace-nowrap">
                    {qa.category}
                  </span>
                  <span className="text-sm font-medium text-zinc-200">{qa.question}</span>
                </div>
                <span className="text-zinc-500 ml-4">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pt-0">
                  <p className="text-sm text-zinc-400 leading-relaxed pl-[72px]">{qa.answer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
