"use client";

import React from "react";
import { Terminal, ShieldCheck, ArrowRight } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-[70vh] flex flex-col justify-center items-center px-6 py-20 border-b border-slate-800">
      {/* Background Subtle Grid */}
      <div className="absolute inset-0 z-0 opacity-20 [background-image:linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [background-size:40px_40px]"></div>

      <div className="z-10 max-w-5xl w-full text-center mb-12">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
          We build <span className="text-blue-500 italic">resilient</span>{" "}
          software.
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          A specialized engineering duo bridging the gap between high-velocity
          development and enterprise-grade quality assurance.
        </p>
      </div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {/* Seth's Side */}
        <div className="group relative p-8 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Terminal className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-white">The Build</h3>
          </div>
          <p className="text-slate-400 mb-4">
            **Seth** | Senior Software Engineer. Focusing on scalable Next.js
            architectures and performance-first systems.
          </p>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
              React
            </span>
            <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
              Node.js
            </span>
            <span className="text-xs font-mono bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
              Architecture
            </span>
          </div>
        </div>

        {/* Christine's Side */}
        <div className="group relative p-8 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-xl font-semibold text-white">The Break</h3>
          </div>
          <p className="text-slate-400 mb-4">
            **Christine** | Senior QA Engineer. Hardening applications through
            automated testing and performance auditing.
          </p>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
              Playwright
            </span>
            <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
              Cypress
            </span>
            <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
              Load Testing
            </span>
          </div>
        </div>
      </div>

      <button className="z-10 mt-12 flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-full hover:bg-slate-200 transition-colors">
        View the Studio Showcase <ArrowRight className="w-4 h-4" />
      </button>
    </section>
  );
};

export default Hero;
