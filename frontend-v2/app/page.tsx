"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Network,
  Cpu,
  FileCheck,
  ArrowRight,
  Globe,
  Fingerprint,
  Database,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-body">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-tertiary/5 via-secondary/5 to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-tertiary/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-8 pt-32 pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full border border-outline-variant/20 mb-8">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-xs font-label text-on-surface-variant uppercase tracking-widest">
                Zero-Knowledge Identity Protocol
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-headline font-bold tracking-tight text-primary leading-tight mb-6">
              블록체인 신원 인증,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tertiary to-secondary">
                개인정보 없이.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed mb-12">
              공인인증서(X.509)로 블록체인에서 신원을 증명합니다.
              ZK proof를 통해 이름, 주민번호 등 개인정보를 노출하지 않고
              유효한 인증서 보유 사실만 검증합니다.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/dashboard"
                className="px-10 py-4 bg-primary text-surface font-headline font-bold rounded-full hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 text-lg"
              >
                시작하기 <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/faq"
                className="px-10 py-4 border border-outline-variant/30 text-on-surface font-headline rounded-full hover:bg-surface-container-highest transition-all text-lg"
              >
                자세히 알아보기
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-8 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-headline font-bold text-primary mb-4">
            어떻게 동작하나요?
          </h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            3단계로 블록체인 신원 인증이 완료됩니다.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              icon: FileCheck,
              title: "인증서로 증명 생성",
              desc: "로컬에서 공인인증서와 개인키로 ZK proof를 생성합니다. 개인키는 외부로 전송되지 않습니다.",
              color: "tertiary",
            },
            {
              step: "02",
              icon: Lock,
              title: "On-Chain 검증",
              desc: "Groth16 proof를 스마트 컨트랙트에 제출합니다. 컨트랙트가 proof의 수학적 유효성을 검증합니다.",
              color: "secondary",
            },
            {
              step: "03",
              icon: ShieldCheck,
              title: "신원 등록 완료",
              desc: "검증 통과 시 지갑 주소가 인증됩니다. 다른 DApp은 isVerified()로 인증 여부를 조회합니다.",
              color: "tertiary",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="glass-panel rounded-3xl p-8 relative group"
            >
              <span className={`text-6xl font-headline font-bold text-${item.color}/10 absolute top-4 right-6`}>
                {item.step}
              </span>
              <div className={`p-3 bg-${item.color}/10 rounded-xl w-fit mb-6`}>
                <item.icon className={`w-6 h-6 text-${item.color}`} />
              </div>
              <h3 className="text-xl font-headline font-bold text-primary mb-3">{item.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Key Features */}
      <section className="max-w-6xl mx-auto px-8 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-headline font-bold text-primary mb-4">
            핵심 특징
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: EyeOff,
              title: "프라이버시",
              desc: "개인정보가 블록체인에 올라가지 않습니다. nullifier 해시만 저장되어 중복 방지에 사용됩니다.",
            },
            {
              icon: Fingerprint,
              title: "Selective Disclosure",
              desc: "국가, 기관, 이름 중 원하는 항목만 선택적으로 공개할 수 있습니다.",
            },
            {
              icon: Network,
              title: "CA 익명성",
              desc: "Merkle Tree로 어떤 CA가 발급했는지 숨기면서 신뢰 목록에 포함됨을 증명합니다.",
            },
            {
              icon: Globe,
              title: "멀티체인",
              desc: "체인별 독립 nullifier로 크로스체인 추적이 불가능합니다. 어떤 EVM 체인이든 배포 가능.",
            },
            {
              icon: Database,
              title: "자동 만료",
              desc: "인증서 만료일이 on-chain에 저장되어 만료 후 자동으로 인증이 해제됩니다.",
            },
            {
              icon: Cpu,
              title: "SP1 zkVM",
              desc: "Succinct SP1으로 Rust 프로그램을 그대로 ZK proof로 변환. 17M cycles, Groth16 검증.",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 hover:border-outline-variant/30 transition-all group"
            >
              <item.icon className="w-5 h-5 text-tertiary mb-4 group-hover:text-secondary transition-colors" />
              <h3 className="text-lg font-headline font-bold text-primary mb-2">{item.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Architecture Banner */}
      <section className="max-w-6xl mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-panel rounded-3xl p-12 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/80 to-transparent z-0" />
          <div className="relative z-10 max-w-xl">
            <h2 className="text-3xl font-headline font-bold text-primary mb-4">
              시스템 구조
            </h2>
            <div className="text-on-surface-variant leading-relaxed space-y-3 text-sm mb-8">
              <p>
                <span className="text-tertiary font-mono">zkVM Program</span> — X.509 파싱, 서명 검증, Merkle 증명을 SP1 안에서 실행
              </p>
              <p>
                <span className="text-secondary font-mono">Groth16 Proof</span> — Core proof를 EVM 검증 가능한 ~260 bytes로 압축
              </p>
              <p>
                <span className="text-tertiary font-mono">IdentityRegistry</span> — 등록, 재등록, 폐기, CA 관리를 하나의 컨트랙트로
              </p>
            </div>
            <div className="flex gap-4">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-primary text-surface font-headline font-bold rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                대시보드 <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/admin"
                className="px-6 py-3 border border-outline-variant/30 text-on-surface font-headline rounded-full hover:bg-surface-container-highest transition-all"
              >
                관리자 콘솔
              </Link>
            </div>
          </div>
          <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center bg-surface/40 backdrop-blur-md p-8 rounded-3xl border border-outline-variant/20">
            <div className="text-5xl font-headline font-bold text-tertiary mb-1">17M</div>
            <div className="text-[10px] text-on-surface font-label uppercase tracking-[0.2em] opacity-60 text-center">
              zkVM Cycles
            </div>
            <div className="text-3xl font-headline font-bold text-secondary mt-4 mb-1">~260B</div>
            <div className="text-[10px] text-on-surface font-label uppercase tracking-[0.2em] opacity-60 text-center">
              On-chain Proof
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-8 py-12 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-tertiary" />
          <span className="text-sm font-label">zk-X509 Protocol</span>
        </div>
        <div className="flex gap-8 text-[10px] font-label uppercase tracking-widest">
          <Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link>
          <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
          <a href="https://github.com/tokamak-network/zk-X509" className="hover:text-primary transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
