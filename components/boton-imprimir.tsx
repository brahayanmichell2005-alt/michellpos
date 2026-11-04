"use client";

export default function BotonImprimir({ className = "" }: { className?: string }) {
  return (
    <button onClick={() => window.print()} className={className}>
      🖨️ Imprimir ticket
    </button>
  );
}
