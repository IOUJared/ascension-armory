"use client";

import Image from "next/image";
import { ArrowLeft, Check, Shield, Swords, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { ascensionIconUrl } from "@/lib/icons";
import { COA_CLASSES, COA_DATA_SOURCE, COA_DISCLAIMER } from "@/lib/coa";
import type { CoASelection, GearContext } from "@/types/coa";

interface CoAClassSelectorProps {
  current?: CoASelection;
  onSelect: (selection: CoASelection) => void;
  onClose?: () => void;
}

function CoAIcon({ icon, alt, size = 48 }: { icon: string; alt: string; size?: number }) {
  const src = ascensionIconUrl(icon, "large");
  return src ? <Image src={src} alt={alt} width={size} height={size} unoptimized /> : null;
}

export function CoAClassSelector({ current, onSelect, onClose }: CoAClassSelectorProps) {
  const [classSlug, setClassSlug] = useState<string | null>(current?.classSlug ?? null);
  const [context, setContext] = useState<GearContext>(current?.context ?? "pve");
  const selectedClass = COA_CLASSES.find((item) => item.slug === classSlug);

  return (
    <div className="class-gate-backdrop">
      <section className="class-gate" role="dialog" aria-modal="true" aria-label="Choose a Conquest of Azeroth class and specialization">
        <header className="class-gate-header">
          <div>
            <p className="eyebrow">Conquest of Azeroth / Character setup</p>
            <h1>{selectedClass ? `Choose a ${selectedClass.name} specialization` : "Who will answer Azeroth’s call?"}</h1>
            <p>{selectedClass ? "Your specialization sets the initial stat priority and gear ranking profile." : "Choose one of the 21 original classes. You can change this later without losing your equipped items."}</p>
          </div>
          {onClose ? <button className="icon-button" onClick={onClose} aria-label="Close class selection"><X size={18} /></button> : null}
        </header>

        <div className="class-gate-toolbar">
          {selectedClass ? <button className="class-back" onClick={() => setClassSlug(null)}><ArrowLeft size={15} /> All classes</button> : <span className="class-count">21 classes · 70 specializations</span>}
          <div className="context-toggle" aria-label="Gear context">
            <button className={context === "pve" ? "active" : ""} onClick={() => setContext("pve")}><Swords size={14} /> PvE</button>
            <button className={context === "pvp" ? "active" : ""} onClick={() => setContext("pvp")}><Shield size={14} /> PvP</button>
          </div>
        </div>

        <div className="class-gate-content custom-scrollbar">
          {!selectedClass ? (
            <div className="class-choice-grid">
              {COA_CLASSES.map((classInfo) => (
                <button
                  className="class-choice"
                  key={classInfo.slug}
                  onClick={() => setClassSlug(classInfo.slug)}
                  style={{ "--class-color": classInfo.color } as CSSProperties}
                >
                  <span className="class-choice-icon"><CoAIcon icon={classInfo.icon} alt="" /></span>
                  <span><strong>{classInfo.name}</strong><small>{classInfo.theme}</small><em>{classInfo.specs.length} specializations</em></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="spec-choice-layout">
              <aside className="chosen-class-card" style={{ "--class-color": selectedClass.color } as CSSProperties}>
                <span className="chosen-class-icon"><CoAIcon icon={selectedClass.icon} alt="" size={72} /></span>
                <p className="eyebrow">{selectedClass.faction}</p>
                <h2>{selectedClass.name}</h2>
                <p>{selectedClass.summary}</p>
              </aside>
              <div className="spec-choice-list">
                {selectedClass.specs.map((spec) => {
                  const priority = spec.statPriority[context] || spec.statPriority.pve;
                  return (
                    <button className="spec-choice" key={spec.name} onClick={() => onSelect({ classSlug: selectedClass.slug, specName: spec.name, context })}>
                      <span className="spec-choice-icon"><CoAIcon icon={spec.icon} alt="" size={54} /></span>
                      <span className="spec-choice-main">
                        <span className="spec-choice-heading"><strong>{spec.name}</strong><em>{spec.role}</em></span>
                        <span className="spec-choice-meta">{spec.primaryStats.join(" / ") || "Flexible"} · {spec.complexity} · {spec.weapon.style}</span>
                        <span className="spec-priority"><small>{context.toUpperCase()} priority</small>{priority}</span>
                      </span>
                      <span className="choose-spec"><Check size={14} /> Use build</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="class-gate-footer">
          <span>{COA_DISCLAIMER}</span>
          <a href={COA_DATA_SOURCE.replace("/data.js", "/coa")} target="_blank" rel="noreferrer">Data: Ascension Sidekick ↗</a>
        </footer>
      </section>
    </div>
  );
}
