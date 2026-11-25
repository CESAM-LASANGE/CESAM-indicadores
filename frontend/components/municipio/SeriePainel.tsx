"use client";

import { Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { temaConfig } from "@/components/municipio/fichaConfig";
import { Delta } from "@/components/ui/Delta";
import { Valor } from "@/components/ui/Valor";
import type { Indicador } from "@/lib/api";
import { ehPercentual, formatarNumero, formatarValor, unidadeExibicao } from "@/lib/formatters";

export type PontoHistorico = { ano: number; valor: number; fonte: string | null };

function ehFonteSinisa(fonte: string | null): boolean {
  return (fonte ?? "").toLocaleLowerCase("pt-BR").includes("sinisa");
}

/** Primeiro ano em que a série muda de SNIS para SINISA (ou de uma fonte para outra). */
export function anoTrocaDeFonte(pontos: PontoHistorico[]): number | null {
  for (let indice = 1; indice < pontos.length; indice += 1) {
    if (ehFonteSinisa(pontos[indice].fonte) !== ehFonteSinisa(pontos[indice - 1].fonte)) {
      return pontos[indice].ano;
    }
  }
  return null;
}

function passoRedondo(amplitude: number): number {
  const bruto = amplitude / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto || 1));
  const normalizado = bruto / potencia;
  const fator = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10;
  return fator * potencia;
}

/** CP-09.2: eixo Y com ticks redondos; para %, de 0 até o próximo múltiplo de 10 acima do máximo. */
export function escalaEixo(valores: number[], unidade: string | null | undefined): { min: number; max: number; ticks: number[] } {
  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);

  if (ehPercentual(unidade)) {
    const topo = Math.min(100, Math.max(10, Math.ceil(maximo / 10) * 10));
    const passo = passoRedondo(topo);
    const ticks = [];
    for (let tick = 0; tick <= topo + 1e-9; tick += passo) ticks.push(Number(tick.toFixed(6)));
    return { min: 0, max: topo, ticks };
  }

  const base = minimo >= 0 ? 0 : minimo;
  const passo = passoRedondo(maximo - base || Math.abs(maximo) || 1);
  const min = Math.floor(base / passo) * passo;
  const max = Math.ceil(maximo / passo) * passo || passo;
  const ticks = [];
  for (let tick = min; tick <= max + 1e-9; tick += passo) ticks.push(Number(tick.toFixed(6)));
  return { min, max, ticks };
}

/** Largura real do contêiner, para o SVG usar 1 unidade = 1 px e o texto não encolher no celular. */
function useLargura<T extends HTMLElement>(inicial: number) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(Math.round(entrada.contentRect.width)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return [ref, largura] as const;
}

function GraficoSerie({ pontos, indicador, cor }: { pontos: PontoHistorico[]; indicador: Indicador; cor: string }) {
  const [ref, larguraMedida] = useLargura<HTMLDivElement>(560);
  const largura = Math.max(280, larguraMedida);
  const altura = largura < 480 ? 210 : 250;
  const margem = { top: 30, right: 16, bottom: 30, left: 44 };
  const areaL = largura - margem.left - margem.right;
  const areaA = altura - margem.top - margem.bottom;
  const { min, max, ticks } = escalaEixo(
    pontos.map((ponto) => ponto.valor),
    indicador.unidade
  );
  const x = (indice: number) => margem.left + (indice / Math.max(1, pontos.length - 1)) * areaL;
  const y = (valor: number) => margem.top + ((max - valor) / (max - min || 1)) * areaA;
  const linha = pontos.map((ponto, indice) => `${indice === 0 ? "M" : "L"}${x(indice).toFixed(1)} ${y(ponto.valor).toFixed(1)}`).join(" ");
  const base = y(Math.max(min, 0));
  const area = `${linha} L${x(pontos.length - 1).toFixed(1)} ${base.toFixed(1)} L${x(0).toFixed(1)} ${base.toFixed(1)} Z`;
  const maxRotulos = Math.max(3, Math.floor(areaL / 64));
  const intervaloAno = Math.max(1, Math.ceil(pontos.length / maxRotulos));
  const ultimoIndice = pontos.length - 1;
  // Rótulo de ano a cada intervalo; o último sempre aparece e o vizinho anterior some se ficar colado nele.
  const mostrarAno = (indice: number) =>
    indice === ultimoIndice || (indice % intervaloAno === 0 && ultimoIndice - indice >= Math.max(1, intervaloAno * 0.6));
  const troca = anoTrocaDeFonte(pontos);
  const indiceTroca = troca === null ? -1 : pontos.findIndex((ponto) => ponto.ano === troca);
  const casas = ehPercentual(indicador.unidade) ? 0 : 1;
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const texto = (valor: number) => {
    const formatado = formatarValor(valor, indicador.unidade);
    return formatado.unidade ? `${formatado.numero} ${formatado.unidade}` : formatado.numero;
  };
  const xTroca = indiceTroca > 0 ? (x(indiceTroca) + x(indiceTroca - 1)) / 2 : null;
  const xUltimo = x(pontos.length - 1);
  const yUltimo = y(ultimo.valor);

  return (
    <div ref={ref} className="w-full">
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      width={largura}
      height={altura}
      className="block h-auto w-full"
      role="img"
      aria-label={`${indicador.nome}: ${texto(primeiro.valor)} em ${primeiro.ano} e ${texto(ultimo.valor)} em ${ultimo.ano}.`}
    >
      {/* Período SINISA destacado como faixa de fundo, com o rótulo de cada fonte no topo */}
      {xTroca !== null ? (
        <g>
          <rect
            x={xTroca}
            y={margem.top}
            width={largura - margem.right - xTroca}
            height={areaA}
            fill="var(--sem-positive-bg)"
            opacity={0.7}
          />
          <line x1={xTroca} x2={xTroca} y1={margem.top - 4} y2={margem.top + areaA} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
          <text x={margem.left} y={margem.top - 10} className="fill-ms-muted text-[11px] font-semibold">
            ← SNIS
          </text>
          <text x={largura - margem.right} y={margem.top - 10} textAnchor="end" className="fill-sem-positive text-[11px] font-semibold">
            SINISA {troca}–{ultimo.ano} →
          </text>
        </g>
      ) : null}
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={margem.left} x2={largura - margem.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" />
          <text x={margem.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-ms-muted font-data text-[11px]">
            {formatarNumero(tick, casas, false)}
          </text>
        </g>
      ))}
      <path d={area} fill={cor} opacity={0.08} />
      <path d={linha} fill="none" stroke={cor} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {pontos.map((ponto, indice) => (
        <g key={ponto.ano}>
          <circle cx={x(indice)} cy={y(ponto.valor)} r={indice === pontos.length - 1 ? 4.5 : 2.5} fill={indice === pontos.length - 1 ? cor : "var(--color-surface)"} stroke={cor} strokeWidth={1.5}>
            <title>{`${ponto.ano}: ${texto(ponto.valor)}`}</title>
          </circle>
          {mostrarAno(indice) ? (
            <text
              x={x(indice)}
              y={altura - 8}
              textAnchor={indice === ultimoIndice ? "end" : indice === 0 ? "start" : "middle"}
              className="fill-ms-muted font-data text-[11px]"
            >
              {ponto.ano}
            </text>
          ) : null}
        </g>
      ))}
      {/* Rótulo do último valor, acima do ponto */}
      <text x={Math.min(xUltimo, largura - margem.right)} y={Math.max(yUltimo - 12, 12)} textAnchor="end" className="fill-ms-ink font-data text-[12px] font-medium">
        {formatarValor(ultimo.valor, indicador.unidade).numero}
      </text>
    </svg>
    </div>
  );
}

type Props = {
  indicador: Indicador;
  municipio: string;
  pontos: PontoHistorico[];
  onFechar: () => void;
};

/**
 * CP-10 / PG-03.11: painel lateral modal (640 px no desktop, tela cheia no celular),
 * aberto por clique no minigráfico; Esc fecha e devolve o foco.
 */
export function SeriePainel({ indicador, municipio, pontos, onFechar }: Props) {
  const tituloId = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const config = temaConfig(indicador.tema);
  const Icone = config.icon;
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const troca = anoTrocaDeFonte(pontos);
  const unidade = unidadeExibicao(indicador.unidade);
  const minimo = pontos.reduce((menor, ponto) => (ponto.valor < menor.valor ? ponto : menor), primeiro);
  const maximo = pontos.reduce((maior, ponto) => (ponto.valor > maior.valor ? ponto : maior), primeiro);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    painelRef.current?.focus();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoTeclar(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onFechar();
        return;
      }
      if (event.key !== "Tab" || !painelRef.current) return;
      const focaveis = painelRef.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
      if (focaveis.length === 0) return;
      const primeiroFocavel = focaveis[0];
      const ultimoFocavel = focaveis[focaveis.length - 1];
      if (event.shiftKey && (document.activeElement === primeiroFocavel || document.activeElement === painelRef.current)) {
        event.preventDefault();
        ultimoFocavel.focus();
      } else if (!event.shiftKey && document.activeElement === ultimoFocavel) {
        event.preventDefault();
        primeiroFocavel.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus({ preventScroll: true });
    };
  }, [onFechar]);

  const resumo: Array<{ rotulo: string; conteudo: React.ReactNode }> = [
    {
      rotulo: String(primeiro.ano),
      conteudo: <Valor valor={primeiro.valor} unidade={indicador.unidade} numeroClassName="text-lg font-medium" />,
    },
    {
      rotulo: String(ultimo.ano),
      conteudo: <Valor valor={ultimo.valor} unidade={indicador.unidade} numeroClassName="text-lg font-medium" />,
    },
    {
      rotulo: `Variação ${primeiro.ano}–${ultimo.ano}`,
      conteudo: (
        <Delta
          variacao={ultimo.valor - primeiro.valor}
          sentido={indicador.sentido}
          unidade={indicador.unidade}
          desde={primeiro.ano}
          mostrarAvaliacao
          className="text-sm"
        />
      ),
    },
  ];

  return (
    <>
      <div className="painel-fundo no-print fixed inset-0 z-50 bg-ms-ink/40" aria-hidden="true" onClick={onFechar} />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="painel-lateral no-print fixed inset-0 z-50 flex flex-col overflow-y-auto overflow-x-hidden bg-ms-surface shadow-e2 outline-none sm:left-auto sm:w-[min(640px,92vw)] sm:border-l sm:border-ms-line"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ms-line bg-ms-surface px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-ms-muted">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-white ${config.bgClass}`}>
                <Icone className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              </span>
              Série histórica · {indicador.tema}
            </p>
            <h2 id={tituloId} className="mt-1.5 font-sans text-lg font-semibold leading-snug tracking-normal text-ms-ink">
              {indicador.nome}
            </h2>
            <p className="mt-0.5 text-[13px] text-ms-muted">
              {municipio} · {primeiro.ano}–{ultimo.ano}
              {unidade ? ` · ${unidade}` : ""}
              {indicador.sentido === "menor_melhor" ? " · menor é melhor" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ms-line text-ms-ink hover:border-ms-blue hover:text-ms-blue"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Fechar série histórica</span>
          </button>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-6">
          <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-ms-line sm:grid-cols-3">
            {resumo.map((item, indice) => (
              <div
                key={item.rotulo}
                className={`grid content-start gap-1 px-4 py-3 ${indice > 0 ? "border-l border-ms-line" : ""} ${
                  indice === 2 ? "col-span-2 border-l-0 border-t sm:col-span-1 sm:border-l sm:border-t-0" : ""
                }`}
              >
                <dt className="t-label text-ms-muted">{item.rotulo}</dt>
                <dd>{item.conteudo}</dd>
              </div>
            ))}
          </dl>

          <figure className="grid gap-2">
            <GraficoSerie pontos={pontos} indicador={indicador} cor={config.cor} />
            <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ms-muted">
              <span>
                Menor valor: <span className="font-data text-ms-ink">{formatarValor(minimo.valor, indicador.unidade).numero}</span> em{" "}
                {minimo.ano}
              </span>
              <span>
                Maior valor: <span className="font-data text-ms-ink">{formatarValor(maximo.valor, indicador.unidade).numero}</span> em{" "}
                {maximo.ano}
              </span>
            </figcaption>
          </figure>

          {troca ? (
            <p className="flex items-start gap-2 rounded-md bg-sem-info-bg px-3 py-2.5 text-[13px] text-ms-navy">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sem-info" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Até {troca - 1} os dados vêm do SNIS Série Histórica; a partir de {troca}, do SINISA. A metodologia pode mudar entre as
                fontes.
              </span>
            </p>
          ) : null}

          <div>
            <h3 className="t-label mb-2 text-ms-muted">Valores por ano</h3>
            <div className="overflow-hidden rounded-md border border-ms-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Valores por ano de {indicador.nome}</caption>
                <thead className="border-b border-ms-line bg-ms-surface-muted text-left">
                  <tr>
                    <th scope="col" className="t-label px-4 py-2 text-ms-muted">Ano</th>
                    <th scope="col" className="t-label px-4 py-2 text-right text-ms-muted">Valor</th>
                    <th scope="col" className="t-label px-4 py-2 text-ms-muted">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pontos].reverse().map((ponto) => {
                    const sinisa = ehFonteSinisa(ponto.fonte);
                    return (
                      <tr key={ponto.ano} className="border-b border-ms-line last:border-b-0 even:bg-ms-surface-muted/60">
                        <td className="font-data px-4 py-1.5 text-ms-ink">{ponto.ano}</td>
                        <td className="px-4 py-1.5 text-right text-ms-ink">
                          <Valor valor={ponto.valor} unidade={indicador.unidade} />
                        </td>
                        <td className="px-4 py-1.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-ms-muted" title={ponto.fonte ?? undefined}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sinisa ? "bg-sem-positive" : "bg-sem-info"}`} aria-hidden="true" />
                            {sinisa ? "SINISA" : "SNIS"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
