import Link from "next/link";
import { CheckCircle2, Droplets, ExternalLink, MapPin, MinusCircle } from "lucide-react";

import { MiniMapaMunicipio } from "@/components/MiniMapaMunicipio";
import { calcularCobertura } from "@/components/municipio/fichaConfig";
import { Badge } from "@/components/ui/Badge";
import { COR_CLASSE } from "@/lib/escalaMapa";
import type { AtendimentoAgua, Municipio, ValorIndicador } from "@/lib/api";
import { fonteCurta, resumoAtuacao } from "@/lib/prestador";
import { urlExternaSegura } from "@/lib/urls";
import { cn } from "@/lib/utils";

/**
 * Cobertura oficial por dimensão (PG-03.3.1): linha discreta no rodapé da faixa de notas,
 * com ícone e nome da dimensão + estado em texto acessível.
 */
export function CoberturaOficial({ indicadores }: { indicadores: ValorIndicador[] }) {
  const cobertura = calcularCobertura(indicadores);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs font-semibold text-ms-muted">Cobertura oficial</span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {cobertura.map(({ tema, config, coberto }) => {
          const Estado = coberto ? CheckCircle2 : MinusCircle;
          return (
            <li
              key={tema}
              title={
                coberto
                  ? `${tema}: dado oficial (SINISA ou SNIS) disponível para este município.`
                  : `${tema}: nenhuma fonte oficial reportou dado para este município até o momento.`
              }
              className={cn("inline-flex items-center gap-1 text-xs", coberto ? "text-ms-ink" : "text-ms-muted")}
            >
              <Estado
                className={cn("h-3.5 w-3.5", coberto ? "text-sem-positive" : "text-ms-muted")}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {config.nomeCurto}
              <span className="sr-only">{coberto ? "com dado oficial" : "sem dado oficial"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type PrestadorProps = {
  municipio: Municipio;
  atendimento: AtendimentoAgua | null;
  institucionalDisponivel?: boolean;
};

/** Faixa do prestador de água (PG-03.12): uma linha horizontal abaixo das notas. */
export function PrestadorAgua({ municipio, atendimento, institucionalDisponivel = true }: PrestadorProps) {
  const prestador = !institucionalDisponivel
    ? "Dados institucionais indisponíveis"
    : atendimento
    ? `${atendimento.prestador_nome}${atendimento.sigla ? ` (${atendimento.sigla})` : ""}`
    : "Não informado";
  const gestaoMunicipal = atendimento
    ? /autarquia|prefeitura|municipal|saae|servi[cç]o aut[oô]nomo/i.test(
        `${atendimento.prestador_nome} ${atendimento.sigla ?? ""} ${atendimento.natureza_juridica ?? ""}`,
      )
    : false;
  const endereco = atendimento?.endereco ? `${atendimento.endereco}, ${municipio.nome} - MS` : null;
  const resumo = atendimento && institucionalDisponivel
    ? [...resumoAtuacao(atendimento.area_atuacao), fonteCurta(atendimento.fonte)].filter(Boolean)
    : [];
  const siteUrl = urlExternaSegura(atendimento?.site_url);
  const mapsUrl = urlExternaSegura(atendimento?.maps_url);

  return (
    <section
      aria-label="Prestador de água"
      className="flex flex-col gap-3 rounded-md border border-ms-line bg-ms-surface p-4 sm:flex-row sm:items-center sm:gap-4"
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ms-sky text-dim-agua"
        aria-hidden="true"
      >
        <Droplets className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="t-label text-ms-muted">{gestaoMunicipal ? "Serviço municipal de água" : "Prestador de água"}</p>
          {gestaoMunicipal ? <Badge variante="official">Gestão municipal</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-ms-ink [overflow-wrap:anywhere]">{prestador}</p>
        {resumo.length ? (
          <p className="mt-0.5 text-[13px] text-ms-muted" title={[atendimento?.area_atuacao, atendimento?.fonte].filter(Boolean).join(" · ")}>
            {resumo.join(" · ")}
          </p>
        ) : null}
        {/* PG-03.12: endereço e fonte por extenso ficam na impressão e no nome acessível dos links. */}
        <div className="print-only mt-1 text-xs text-ms-muted">
          <p>{endereco ?? "Endereço local não confirmado em fonte institucional."}</p>
          <p>Fonte: {atendimento?.fonte ?? "não informada"}</p>
        </div>
      </div>
      {atendimento && (siteUrl || mapsUrl) ? (
        <div className="no-print flex shrink-0 flex-wrap gap-2">
          {siteUrl ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ms-line-strong px-2.5 text-[13px] font-semibold text-ms-ink hover:border-ms-blue hover:text-ms-blue"
            >
              {atendimento.site_label || "Site do prestador"}
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          ) : null}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={endereco ?? undefined}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ms-line-strong px-2.5 text-[13px] font-semibold text-ms-ink hover:border-ms-blue hover:text-ms-blue"
            >
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Endereço no mapa
              <span className="sr-only">{endereco ? `: ${endereco}` : ""} (abre em nova aba)</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type LocalizacaoProps = {
  municipio: Municipio;
  /** Nota geral por código IBGE, para colorir o minimapa. */
  notas?: Record<string, number>;
  anoNotas?: number;
};

const LEGENDA_CLASSES = [1, 2, 3, 4, 5] as const;

/** Card de localização: minimapa na altura das notas + legenda compacta (PG-03.12). */
export function LocalizacaoMunicipio({ municipio, notas, anoNotas }: LocalizacaoProps) {
  return (
    <aside
      aria-label="Localização no estado"
      className="flex h-full flex-col overflow-hidden rounded-md border border-ms-line bg-ms-surface"
    >
      <div className="px-4 pt-3">
        <p className="t-label text-ms-muted">Localização</p>
        <p className="mt-0.5 text-sm font-semibold text-ms-ink">{municipio.nome} · Mato Grosso do Sul</p>
      </div>
      {/* O mapa ocupa a altura que sobra: o card acompanha a coluna das notas, sem espaço vazio. */}
      <div className="relative min-h-40 flex-1">
        <MiniMapaMunicipio
          codigoIbge={municipio.codigo_ibge}
          municipio={municipio.nome}
          notas={notas}
          className="absolute inset-0 block h-full w-full p-2"
        />
      </div>
      {notas && anoNotas ? (
        <div className="flex items-center gap-1.5 border-t border-ms-line bg-ms-surface-muted px-4 py-2 text-xs text-ms-muted">
          <Link href="/metodologia" className="font-semibold text-ms-blue hover:underline">
            Nota geral {anoNotas}
          </Link>
          <span className="ml-auto font-data">0</span>
          <span className="flex" aria-hidden="true">
            {LEGENDA_CLASSES.map((classe) => (
              <span key={classe} className="h-2.5 w-4" style={{ background: COR_CLASSE[classe] }} />
            ))}
          </span>
          <span className="font-data">100</span>
        </div>
      ) : null}
    </aside>
  );
}
