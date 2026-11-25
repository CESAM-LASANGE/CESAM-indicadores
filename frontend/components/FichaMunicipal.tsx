"use client";

import { ChevronDown, ChevronRight, Download, Printer, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Municipio, RecursoMunicipal, ValorIndicador } from "@/lib/api";
import { baixarCsvMunicipal } from "@/lib/exportarCsv";
import { ehUnidadeBinaria, formatarNota, rotuloFonteCurto } from "@/lib/formatters";
import { normalizarBusca } from "@/lib/buscaMunicipio";
import { INDICADORES_DESTAQUE, ehDestaque, selecionarDestaques } from "@/lib/indicadoresDestaque";
import type { RankingSaneamentoItem } from "@/lib/rankingSaneamento";
import { ehStatusOficial } from "@/lib/statusValidacao";
import { cn } from "@/lib/utils";
import { RecursoGestao } from "@/components/municipio/RecursoGestao";
import { SeriePainel, type PontoHistorico } from "@/components/municipio/SeriePainel";
import { notaDoModulo, ordenarTexto, ordemTema, temaConfig } from "@/components/municipio/fichaConfig";
import { Badge, rotuloFonte } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Delta } from "@/components/ui/Delta";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkline } from "@/components/ui/Sparkline";
import { Valor } from "@/components/ui/Valor";

type Props = {
  municipio: Municipio;
  indicadores: ValorIndicador[];
  recursos?: RecursoMunicipal[];
  /** Nota do ranking para as abas de dimensão (ADR-001). */
  rankingItem?: RankingSaneamentoItem | null;
  /** PG-03.2: nome e metadados, renderizados no servidor. */
  cabecalho?: ReactNode;
  /** PG-03.3: faixa de notas. */
  faixaNotas?: ReactNode;
  /** PG-03.12: faixa do prestador de água. */
  prestador?: ReactNode;
  /** PG-03.12: card de localização com o minimapa. */
  localizacao?: ReactNode;
};

const TODOS = "todos";
const PAINEL_ID = "painel-indicadores";

// Selects compactos da barra de contexto no desktop; no celular ficam no tamanho de CP-02.
const selectClasses =
  "h-10 w-full appearance-none rounded-md border border-ms-line-strong bg-ms-surface pl-3 pr-8 text-base text-ms-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ms-blue md:text-sm lg:h-7 lg:w-auto lg:border-0 lg:bg-transparent lg:pl-0 lg:pr-6 lg:font-semibold";

const rotuloCampoClasses = "text-[13px] font-semibold text-ms-ink lg:text-[11px] lg:font-semibold lg:uppercase lg:tracking-[0.06em] lg:text-ms-muted";

function fonteDe(valor: ValorIndicador): string {
  return valor.fonte ?? valor.indicador.fonte ?? "Fonte não informada";
}

function construirHistorico(indicadores: ValorIndicador[]): Map<string, PontoHistorico[]> {
  const mapa = new Map<string, Map<number, PontoHistorico>>();

  for (const item of indicadores) {
    if (item.valor === null || ehUnidadeBinaria(item.indicador.unidade)) continue;
    const porAno = mapa.get(item.indicador.codigo) ?? new Map<number, PontoHistorico>();
    const existente = porAno.get(item.ano);
    const fonte = item.fonte ?? item.indicador.fonte;
    // Se dois registros cobrem o mesmo ano, o SINISA prevalece sobre o SNIS.
    if (!existente || (fonte ?? "").toLocaleLowerCase("pt-BR").includes("sinisa")) {
      porAno.set(item.ano, { ano: item.ano, valor: Number(item.valor), fonte });
    }
    mapa.set(item.indicador.codigo, porAno);
  }

  return new Map(
    Array.from(mapa.entries(), ([codigo, porAno]) => [codigo, Array.from(porAno.values()).sort((a, b) => a.ano - b.ano)])
  );
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function ordenarPorNome(valores: ValorIndicador[]): ValorIndicador[] {
  return [...valores].sort((a, b) => ordenarTexto(a.indicador.nome, b.indicador.nome) || b.ano - a.ano);
}

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** Nome do indicador com "menor é melhor" na mesma linha (PG-03.9). */
function nomeIndicador(valor: ValorIndicador) {
  return (
    <span className="font-medium text-ms-ink">
      {valor.indicador.nome}
      {valor.indicador.sentido === "menor_melhor" ? (
        <Badge variante="inverse" className="ml-2 h-5 px-1.5 align-[1px] text-[11px]">
          menor é melhor
        </Badge>
      ) : null}
    </span>
  );
}

function ehSinisa(fonte: string): boolean {
  return /\bSINISA\b/i.test(fonte);
}

/** Fonte em texto discreto com marcador de cor (SINISA verde, SNIS azul), no lugar de um selo por linha. */
function FonteTexto({ valor }: { valor: ValorIndicador }) {
  const fonte = fonteDe(valor);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ms-muted" title={rotuloFonte(fonte, valor.ano)}>
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ehSinisa(fonte) ? "bg-sem-positive" : "bg-sem-info")}
        aria-hidden="true"
      />
      {rotuloFonteCurto(fonte, valor.ano)}
    </span>
  );
}

const thClasses = "t-label px-3 py-2.5 text-ms-muted";

export function FichaMunicipal({
  municipio,
  indicadores,
  recursos = [],
  rankingItem = null,
  cabecalho,
  faixaNotas,
  prestador,
  localizacao
}: Props) {
  const anos = useMemo(
    () => Array.from(new Set(indicadores.map((valor) => valor.ano))).sort((a, b) => b - a),
    [indicadores]
  );
  const temas = useMemo(
    () =>
      Array.from(new Set(indicadores.map((valor) => valor.indicador.tema))).sort((a, b) => {
        const ordem = ordemTema(a) - ordemTema(b);
        return ordem === 0 ? ordenarTexto(a, b) : ordem;
      }),
    [indicadores]
  );
  const fontes = useMemo(() => Array.from(new Set(indicadores.map(fonteDe))).sort(ordenarTexto), [indicadores]);

  const anoPadrao = anos[0] ? String(anos[0]) : TODOS;
  const [ano, setAno] = useState(anoPadrao);
  // PG-03.7: a ficha abre na primeira dimensão.
  const [tema, setTema] = useState(temas[0] ?? TODOS);
  const [verTodos, setVerTodos] = useState(false);
  const [busca, setBusca] = useState("");
  const [fonte, setFonte] = useState(TODOS);
  const [somenteOficiais, setSomenteOficiais] = useState(true);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [serieAberta, setSerieAberta] = useState<ValorIndicador | null>(null);
  const [dataGeracao, setDataGeracao] = useState("");
  const abasRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setDataGeracao(new Date().toLocaleDateString("pt-BR"));
  }, []);

  const filtrados = useMemo(
    () =>
      indicadores
        .filter((valor) => ano === TODOS || String(valor.ano) === ano)
        .filter((valor) => fonte === TODOS || fonteDe(valor) === fonte)
        .filter((valor) => !somenteOficiais || ehStatusOficial(valor.status_validacao))
        .sort((a, b) => {
          const temaCompare = ordemTema(a.indicador.tema) - ordemTema(b.indicador.tema);
          if (temaCompare !== 0) return temaCompare;
          const nomeCompare = ordenarTexto(a.indicador.nome, b.indicador.nome);
          if (nomeCompare !== 0) return nomeCompare;
          return b.ano - a.ano;
        }),
    [ano, fonte, indicadores, somenteOficiais]
  );

  const temasDisponiveis = useMemo(
    () => temas.filter((item) => filtrados.some((valor) => valor.indicador.tema === item)),
    [filtrados, temas]
  );

  const historico = useMemo(
    () => construirHistorico(indicadores.filter((valor) => !somenteOficiais || ehStatusOficial(valor.status_validacao))),
    [indicadores, somenteOficiais]
  );

  /** ADR-007: por dimensão, os destaques; sem destaque com dado, todos os registros da dimensão. */
  const porTema = useMemo(() => {
    const mapa = new Map<string, { todos: ValorIndicador[]; destaques: ValorIndicador[] }>();
    const valoresPorTema = new Map<string, ValorIndicador[]>();

    // Agrupa uma única vez; evita percorrer todos os indicadores para cada dimensão.
    for (const valor of filtrados) {
      const valores = valoresPorTema.get(valor.indicador.tema) ?? [];
      valores.push(valor);
      valoresPorTema.set(valor.indicador.tema, valores);
    }

    for (const item of temasDisponiveis) {
      const todos = ordenarPorNome(valoresPorTema.get(item) ?? []);
      mapa.set(item, { todos, destaques: selecionarDestaques(todos, item) });
    }
    return mapa;
  }, [filtrados, temasDisponiveis]);

  const abas = [...temasDisponiveis, TODOS];
  const abaAtiva = abas.includes(tema) ? tema : abas[0];
  const daAba = abaAtiva === TODOS ? null : (porTema.get(abaAtiva) ?? null);
  const temDestaques = Boolean(daAba && daAba.destaques.length > 0);
  const mostrandoTodosDaAba = verTodos || !temDestaques;

  const grupos: Array<[string, ValorIndicador[]]> =
    abaAtiva === TODOS
      ? temasDisponiveis.map((item) => [item, porTema.get(item)?.todos ?? []])
      : daAba
        ? [[abaAtiva, mostrandoTodosDaAba ? daAba.todos : daAba.destaques]]
        : [];

  // Lista completa: indicadores com série (ou principais) em linhas ricas; os de um só ponto, em tabela compacta.
  const mostrarBusca = abaAtiva === TODOS || (mostrandoTodosDaAba && (daAba?.todos.length ?? 0) > 8);
  const termoBusca = mostrarBusca ? normalizarBusca(busca) : "";
  const blocos = grupos.map(([nomeTema, valores]) => {
    const visiveis = termoBusca ? valores.filter((valor) => normalizarBusca(valor.indicador.nome).includes(termoBusca)) : valores;
    if (abaAtiva !== TODOS && !mostrandoTodosDaAba) return { tema: nomeTema, ricos: visiveis, compactos: [] as ValorIndicador[] };

    const ordem = INDICADORES_DESTAQUE[nomeTema] ?? [];
    const posicao = (valor: ValorIndicador) => {
      const indice = ordem.indexOf(valor.indicador.codigo);
      return indice === -1 ? ordem.length : indice;
    };
    const ricos: ValorIndicador[] = [];
    const compactos: ValorIndicador[] = [];
    for (const valor of visiveis) {
      const comSerie = (historico.get(valor.indicador.codigo)?.length ?? 0) >= 2;
      (ehDestaque(valor.indicador.codigo) || comSerie ? ricos : compactos).push(valor);
    }
    ricos.sort((a, b) => posicao(a) - posicao(b) || ordenarTexto(a.indicador.nome, b.indicador.nome) || b.ano - a.ano);
    return { tema: nomeTema, ricos, compactos };
  });
  const totalBusca = blocos.reduce((total, bloco) => total + bloco.ricos.length + bloco.compactos.length, 0);

  const linhasVisiveis = blocos.flatMap((bloco) => bloco.ricos);

  // Resumo da ContextBar: o conjunto que as abas percorrem (principais ou lista completa).
  const conjuntoResumo =
    abaAtiva === TODOS || verTodos
      ? filtrados
      : temasDisponiveis.flatMap((item) => {
          const grupo = porTema.get(item);
          return grupo && grupo.destaques.length ? grupo.destaques : (grupo?.todos ?? []);
        });
  const totalDimensoes = new Set(conjuntoResumo.map((valor) => valor.indicador.tema)).size;
  const totalFontes = new Set(conjuntoResumo.map(fonteDe)).size;
  const resumoFiltros = `${plural(conjuntoResumo.length, "registro", "registros")} · ${plural(
    totalDimensoes,
    "dimensão",
    "dimensões"
  )} · ${plural(totalFontes, "fonte", "fontes")}`;

  const filtrosAlterados = ano !== anoPadrao || fonte !== TODOS || !somenteOficiais;
  const anoNumero = ano === TODOS ? null : Number(ano);

  const anosSerie = linhasVisiveis.flatMap((valor) => (historico.get(valor.indicador.codigo) ?? []).map((ponto) => ponto.ano));
  const periodoSerie = anosSerie.length ? `${Math.min(...anosSerie)}–${Math.max(...anosSerie)}` : "Série";

  const fecharSerie = useCallback(() => setSerieAberta(null), []);

  function selecionarAba(item: string) {
    setTema(item);
    setVerTodos(false);
    setBusca("");
  }

  function limparFiltros() {
    setAno(anoPadrao);
    setFonte(TODOS);
    setSomenteOficiais(true);
  }

  function aoTeclarAba(event: React.KeyboardEvent<HTMLButtonElement>, indice: number) {
    const ultimo = abas.length - 1;
    const destino =
      event.key === "ArrowRight" ? (indice === ultimo ? 0 : indice + 1)
      : event.key === "ArrowLeft" ? (indice === 0 ? ultimo : indice - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? ultimo
      : null;
    if (destino === null) return;
    event.preventDefault();
    selecionarAba(abas[destino]);
    abasRef.current[destino]?.focus();
  }

  function variacaoAnual(valor: ValorIndicador): { variacao: number; desde: number } | null {
    if (valor.valor === null || ehUnidadeBinaria(valor.indicador.unidade)) return null;
    const anterior = historico.get(valor.indicador.codigo)?.find((ponto) => ponto.ano === valor.ano - 1);
    return anterior ? { variacao: Number(valor.valor) - anterior.valor, desde: anterior.ano } : null;
  }

  /** O minigráfico é o próprio botão que abre a série (sem um botão "Série" repetido em cada linha). */
  function botaoSerie(valor: ValorIndicador, cor: string) {
    const pontos = historico.get(valor.indicador.codigo) ?? [];
    if (pontos.length < 2) {
      return (
        <span className="text-xs text-ms-muted">
          <span aria-hidden="true">—</span>
          <span className="sr-only">sem série histórica</span>
        </span>
      );
    }
    const aberta = serieAberta?.indicador.codigo === valor.indicador.codigo;
    return (
      <button
        type="button"
        onClick={() => setSerieAberta(valor)}
        aria-label={`Série histórica de ${valor.indicador.nome}`}
        aria-haspopup="dialog"
        title="Ver série histórica"
        className={cn(
          "group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ms-sky",
          aberta && "bg-ms-sky"
        )}
      >
        <Sparkline pontos={pontos} cor={cor} />
        <ChevronRight className="h-4 w-4 shrink-0 text-ms-muted group-hover:text-ms-blue" strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }

  const pontosSerie = serieAberta ? (historico.get(serieAberta.indicador.codigo) ?? []) : [];
  const serieVisivel = serieAberta !== null && pontosSerie.length >= 2;

  return (
    <section className="pb-12" aria-label="Indicadores do município">
      <div className="print-only mb-6">
        <p className="eyebrow">Relatório municipal</p>
        <h2 className="t-h2 mt-2 text-ms-ink">{municipio.nome}</h2>
        <p className="mt-1 text-sm text-ms-muted">
          Código IBGE {municipio.codigo_ibge} · Ano {ano === TODOS ? "todos os anos" : ano} · Fonte{" "}
          {fonte === TODOS ? "todas as fontes" : fonte}
          {somenteOficiais ? " · somente oficiais" : ""}
          {dataGeracao ? ` · Gerado em ${dataGeracao}` : ""}
        </p>
      </div>

      {/* PG-03.2 / PG-03.3 / PG-03.12: cabeçalho; notas e prestador à esquerda, localização à direita (mesma altura) */}
      <div className="mt-4 grid gap-5 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {cabecalho}
          <div className="no-print flex shrink-0 flex-wrap gap-2">
            <Button variante="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Imprimir
            </Button>
            <Button variante="primary" onClick={() => baixarCsvMunicipal(municipio, filtrados)} disabled={filtrados.length === 0}>
              <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Exportar CSV
            </Button>
          </div>
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid content-start gap-4">
            {faixaNotas}
            {prestador}
          </div>
          {localizacao}
        </div>
      </div>

      {/* CP-11 Barra de contexto fixa, em uma linha (PG-03.6) */}
      <div className="no-print sticky top-[calc(var(--header-h)+0.5rem)] z-30 rounded-md border border-ms-line bg-ms-surface shadow-e1">
        <div className="flex items-center justify-between gap-3 px-4 py-2 lg:hidden">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold text-ms-ink">{municipio.nome}</span>
            <span className="text-ms-muted">
              {" · "}
              {ano === TODOS ? "Todos os anos" : ano}
              {somenteOficiais ? " · Oficiais" : ""}
            </span>
          </p>
          <Button
            variante="secondary"
            tamanho="sm"
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-ficha"
            onClick={() => setFiltrosAbertos((atual) => !atual)}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Filtros
          </Button>
        </div>

        <div
          id="filtros-ficha"
          className={cn(
            "gap-3 border-t border-ms-line p-4 lg:flex lg:items-center lg:gap-0 lg:border-t-0 lg:px-0 lg:py-2",
            filtrosAbertos ? "grid" : "hidden"
          )}
        >
          <div className="hidden min-w-0 gap-0.5 px-4 lg:grid">
            <span className={rotuloCampoClasses}>Município</span>
            <span className="truncate text-sm font-semibold text-ms-ink">{municipio.nome}</span>
          </div>

          <div className="grid gap-1 lg:gap-0.5 lg:border-l lg:border-ms-line lg:px-4">
            <label htmlFor="ficha-ano" className={rotuloCampoClasses}>
              Ano de referência
            </label>
            <div className="relative">
              <select id="ficha-ano" value={ano} onChange={(event) => setAno(event.target.value)} className={selectClasses}>
                <option value={TODOS}>Todos os anos</option>
                {anos.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ms-muted lg:right-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="grid gap-1 lg:gap-0.5 lg:border-l lg:border-ms-line lg:px-4">
            <label htmlFor="ficha-fonte" className={rotuloCampoClasses}>
              Fonte
            </label>
            <div className="relative">
              <select id="ficha-fonte" value={fonte} onChange={(event) => setFonte(event.target.value)} className={selectClasses}>
                <option value={TODOS}>Todas as fontes</option>
                {fontes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ms-muted lg:right-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </div>
          </div>

          <label className="flex h-10 items-center gap-2 text-sm font-medium text-ms-ink lg:h-10 lg:border-l lg:border-ms-line lg:px-4">
            <input
              type="checkbox"
              checked={somenteOficiais}
              onChange={(event) => setSomenteOficiais(event.target.checked)}
              className="h-[18px] w-[18px] accent-ms-blue"
            />
            Somente oficiais
          </label>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:ml-auto lg:pr-4">
            {filtrosAlterados ? (
              <Button variante="ghost" tamanho="sm" onClick={limparFiltros}>
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Limpar filtros
              </Button>
            ) : null}
            <p className="whitespace-nowrap text-[13px] text-ms-muted" aria-live="polite">
              {resumoFiltros}
            </p>
          </div>
        </div>
      </div>

      {/* CP-12 Abas por dimensão */}
      <div className="no-print relative mt-6 overflow-x-auto scrollbar-none border-b border-ms-line">
        <div role="tablist" aria-label="Dimensões" className="flex min-w-max gap-1">
          {abas.map((item, indice) => {
            const selecionada = item === abaAtiva;
            const config = item === TODOS ? null : temaConfig(item);
            const Icone = config?.icon;
            const nota = item === TODOS ? null : notaDoModulo(rankingItem, item);
            return (
              <button
                key={item}
                ref={(elemento) => {
                  abasRef.current[indice] = elemento;
                }}
                type="button"
                role="tab"
                id={`aba-${slug(item)}`}
                aria-selected={selecionada}
                aria-controls={PAINEL_ID}
                tabIndex={selecionada ? 0 : -1}
                onClick={() => selecionarAba(item)}
                onKeyDown={(event) => aoTeclarAba(event, indice)}
                className={cn(
                  "-mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-semibold",
                  selecionada ? "border-ms-ink text-ms-ink" : "border-transparent text-ms-muted hover:text-ms-ink"
                )}
              >
                {Icone ? (
                  <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded text-white", config?.bgClass)}>
                    <Icone className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  </span>
                ) : null}
                {item === TODOS ? "Todos os indicadores" : item}
                {nota !== null ? (
                  <span className="font-data text-xs font-medium text-ms-muted">
                    {formatarNota(nota)}
                    <span className="sr-only"> de nota em {rankingItem?.ano}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={PAINEL_ID}
        role="tabpanel"
        aria-labelledby={`aba-${slug(abaAtiva)}`}
        className="mt-4 overflow-hidden rounded-md border border-ms-line bg-ms-surface"
      >
        {filtrados.length === 0 ? (
          <EmptyState
            titulo="Não há dados para os filtros selecionados"
            descricao="Mude o ano, a fonte ou desmarque “Somente oficiais”."
            acao={<Button onClick={limparFiltros}>Limpar filtros</Button>}
          />
        ) : (
          <>
            {mostrarBusca ? (
              <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-ms-line px-4 py-3">
                <p className="text-sm text-ms-muted">
                  <span className="font-semibold text-ms-ink">{plural(totalBusca, "indicador", "indicadores")}</span>
                  {abaAtiva === TODOS ? " em todas as dimensões" : ` de ${abaAtiva}`}
                  {anoNumero ? ` · ${anoNumero}` : ""}
                </p>
                <div className="relative w-full sm:w-72">
                  <label htmlFor="ficha-busca" className="sr-only">
                    Filtrar indicadores
                  </label>
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ms-muted"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <input
                    id="ficha-busca"
                    type="search"
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Filtrar indicadores"
                    className="h-9 w-full rounded-md border border-ms-line-strong bg-ms-surface pl-8 pr-3 text-base text-ms-ink outline-none focus:border-ms-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ms-blue md:text-sm"
                  />
                </div>
              </div>
            ) : null}

            {totalBusca === 0 ? (
              <EmptyState
                titulo={`Nenhum indicador encontrado para “${busca}”`}
                descricao="Confira a grafia ou procure por outra palavra do nome do indicador."
                acao={<Button onClick={() => setBusca("")}>Limpar busca</Button>}
              />
            ) : (
              blocos.map((bloco, indiceBloco) => {
                const config = temaConfig(bloco.tema);
                const Icone = config.icon;
                const fontesCompactos = Array.from(new Set(bloco.compactos.map(fonteDe)));
                const metade = Math.ceil(bloco.compactos.length / 2);
                const colunasCompactos = [bloco.compactos.slice(0, metade), bloco.compactos.slice(metade)].filter(
                  (coluna) => coluna.length > 0
                );
                if (bloco.ricos.length === 0 && bloco.compactos.length === 0) return null;

                return (
                  <section key={bloco.tema} aria-label={bloco.tema} className={cn(indiceBloco > 0 && "border-t-4 border-ms-bg")}>
                    {abaAtiva === TODOS ? (
                      <h3 className="flex items-center gap-2 border-b border-ms-line bg-ms-surface-muted px-4 py-2.5 font-sans text-sm font-semibold text-ms-ink">
                        <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded text-white", config.bgClass)}>
                          <Icone className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                        </span>
                        {bloco.tema}
                        <span className="font-normal text-ms-muted">· {bloco.ricos.length + bloco.compactos.length}</span>
                      </h3>
                    ) : null}

                    {bloco.ricos.length > 0 ? (
                      <>
                        {/* CP-13 Tabela de indicadores (desktop e impressão) */}
                        <table className="hidden w-full table-fixed text-sm md:table print:table">
                          <caption className="sr-only">
                            Indicadores de {municipio.nome} · {bloco.tema}
                            {anoNumero ? ` em ${anoNumero}` : ""}
                          </caption>
                          <colgroup>
                            <col />
                            {anoNumero === null ? <col className="w-16" /> : null}
                            <col className="w-36" />
                            <col className="w-36" />
                            <col className="w-36 print:hidden" />
                            <col className="hidden w-28 lg:table-column" />
                          </colgroup>
                          <thead className="border-b border-ms-line text-left">
                            <tr>
                              <th scope="col" className={cn(thClasses, "pl-4")}>Indicador</th>
                              {anoNumero === null ? <th scope="col" className={thClasses}>Ano</th> : null}
                              <th scope="col" className={cn(thClasses, "text-right")}>Valor{anoNumero ? ` ${anoNumero}` : ""}</th>
                              <th scope="col" className={cn(thClasses, "pl-5")}>{anoNumero ? `Desde ${anoNumero - 1}` : "Var. anual"}</th>
                              <th scope="col" className={cn(thClasses, "whitespace-nowrap print:hidden")}>
                                Série {periodoSerie !== "Série" ? periodoSerie : ""}
                              </th>
                              <th scope="col" className={cn(thClasses, "hidden pr-4 lg:table-cell")}>Fonte</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bloco.ricos.map((valor) => {
                              const delta = variacaoAnual(valor);
                              const aberta = serieAberta?.id === valor.id;
                              return (
                                <tr
                                  key={valor.id}
                                  className={cn("border-b border-ms-line last:border-b-0 hover:bg-ms-surface-muted", aberta && "bg-ms-sky/50")}
                                >
                                  <td className="py-3 pl-4 pr-3 align-middle">
                                    {nomeIndicador(valor)}
                                    <span className="mt-0.5 block lg:hidden">
                                      <FonteTexto valor={valor} />
                                    </span>
                                    <RecursoGestao valor={valor} municipio={municipio} recursos={recursos} />
                                  </td>
                                  {anoNumero === null ? <td className="font-data px-3 py-3 align-middle text-ms-muted">{valor.ano}</td> : null}
                                  <td className="px-3 py-3 text-right align-middle text-ms-ink">
                                    <Valor valor={valor.valor} unidade={valor.indicador.unidade} numeroClassName="text-[15px] font-medium" />
                                  </td>
                                  <td className="py-3 pl-5 pr-3 align-middle">
                                    {delta ? (
                                      <Delta variacao={delta.variacao} sentido={valor.indicador.sentido} unidade={valor.indicador.unidade} desde={delta.desde} />
                                    ) : (
                                      <span className="text-xs text-ms-muted">
                                        <span aria-hidden="true">—</span>
                                        <span className="sr-only">sem comparação com o ano anterior</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 align-middle print:hidden">{botaoSerie(valor, config.cor)}</td>
                                  <td className="hidden py-3 pl-3 pr-4 align-middle lg:table-cell">
                                    <FonteTexto valor={valor} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* CP-13.3 Celular: cada indicador vira um bloco */}
                        <ul className="divide-y divide-ms-line md:hidden print:hidden">
                          {bloco.ricos.map((valor) => {
                            const delta = variacaoAnual(valor);
                            return (
                              <li key={valor.id} className="grid gap-1.5 px-4 py-3">
                                <p className="text-sm">{nomeIndicador(valor)}</p>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="grid gap-0.5">
                                    <Valor valor={valor.valor} unidade={valor.indicador.unidade} numeroClassName="text-base font-medium" />
                                    {delta ? (
                                      <Delta
                                        variacao={delta.variacao}
                                        sentido={valor.indicador.sentido}
                                        unidade={valor.indicador.unidade}
                                        desde={delta.desde}
                                      />
                                    ) : null}
                                  </div>
                                  {botaoSerie(valor, config.cor)}
                                </div>
                                <span className="text-xs text-ms-muted">
                                  {anoNumero === null ? `${valor.ano} · ` : ""}
                                  <FonteTexto valor={valor} />
                                </span>
                                <RecursoGestao valor={valor} municipio={municipio} recursos={recursos} />
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : null}

                    {/* Indicadores com um só ano: tabela compacta em duas colunas */}
                    {bloco.compactos.length > 0 ? (
                      <div className={cn(bloco.ricos.length > 0 && "border-t border-ms-line")}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pb-1 pt-4">
                          <h4 className="t-label text-ms-muted">
                            Demais indicadores{" "}
                            <span className="font-data font-medium normal-case tracking-normal">· {bloco.compactos.length}</span>
                          </h4>
                          <p className="text-xs text-ms-muted">
                            Sem série histórica para comparar
                            {fontesCompactos.length === 1 ? ` · ${rotuloFonteCurto(fontesCompactos[0], bloco.compactos[0].ano)}` : ""}
                          </p>
                        </div>
                        <div className="grid px-4 pb-3 lg:grid-cols-2 lg:gap-x-8">
                          {colunasCompactos.map((coluna, indiceColuna) => (
                            <table key={indiceColuna} className="w-full table-fixed text-[13px]">
                              <caption className="sr-only">
                                Demais indicadores de {bloco.tema}
                                {colunasCompactos.length > 1 ? `, parte ${indiceColuna + 1}` : ""}
                              </caption>
                              <thead className="sr-only">
                                <tr>
                                  <th scope="col">Indicador</th>
                                  <th scope="col">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {coluna.map((valor) => (
                                  <tr key={valor.id} className="border-b border-dashed border-ms-line last:border-b-0">
                                    <td className="py-2 pr-3 align-top text-ms-ink">
                                      {nomeIndicador(valor)}
                                      {anoNumero === null || fontesCompactos.length > 1 ? (
                                        <span className="mt-0.5 block text-xs text-ms-muted">
                                          {anoNumero === null ? `${valor.ano} · ` : ""}
                                          {rotuloFonteCurto(fonteDe(valor), valor.ano)}
                                        </span>
                                      ) : null}
                                      <RecursoGestao valor={valor} municipio={municipio} recursos={recursos} />
                                    </td>
                                    <td className="w-32 py-2 text-right align-top text-ms-ink">
                                      <Valor valor={valor.valor} unidade={valor.indicador.unidade} numeroClassName="font-medium" />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}

            {/* ADR-007: acesso à lista completa da dimensão */}
            {daAba && temDestaques && daAba.todos.length > daAba.destaques.length ? (
              <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-ms-line bg-ms-surface-muted px-4 py-2.5">
                <p className="text-xs text-ms-muted">
                  {verTodos
                    ? `${daAba.todos.length} indicadores de ${abaAtiva}`
                    : `Mostrando os ${daAba.destaques.length} principais de ${daAba.todos.length} indicadores`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setVerTodos((atual) => !atual);
                    setBusca("");
                  }}
                  aria-expanded={verTodos}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-ms-blue hover:bg-ms-sky"
                >
                  {verTodos
                    ? `Mostrar só os ${daAba.destaques.length} principais`
                    : `Ver todos os ${daAba.todos.length} indicadores de ${abaAtiva}`}
                  <ChevronDown className={cn("h-4 w-4", verTodos && "rotate-180")} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {serieAberta && serieVisivel ? (
        <SeriePainel indicador={serieAberta.indicador} municipio={municipio.nome} pontos={pontosSerie} onFechar={fecharSerie} />
      ) : null}
    </section>
  );
}
