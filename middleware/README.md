# Sleeper Middleware e MCP

Middleware serverless que mantém o resolvedor REST de jogadores e fornece um
servidor MCP para o plugin Fantasy Assist GM. O MCP concentra as consultas
leves do Sleeper e evita enviar o mapa completo de jogadores ao modelo.

## Endpoint

```http
POST /players/resolve
Content-Type: application/json
```

O servidor MCP usa Streamable HTTP em:

```text
https://fantasy-gmassistant-middleware.vercel.app/mcp
```

Ele expõe dezoito ferramentas somente leitura:

- `get_nfl_state`
- `get_sleeper_user`
- `list_user_nfl_leagues`
- `get_league_details`
- `list_league_rosters`
- `list_league_members`
- `list_league_matchups`
- `list_league_transactions`
- `list_league_traded_picks`
- `list_league_drafts`
- `get_draft_details`
- `list_draft_picks`
- `get_league_playoff_bracket`
- `list_trending_players`
- `list_available_players`
- `analyze_waiver_candidates`
- `get_player_game_logs`
- `resolve_sleeper_players`

Request:

```json
{
  "player_ids": ["11604", "11618", "12469"]
}
```

Response:

```json
{
  "players": [
    {
      "player_id": "11604",
      "full_name": "Example Player",
      "first_name": "Example",
      "last_name": "Player",
      "position": "WR",
      "fantasy_positions": ["WR"],
      "team": "NE",
      "active": true,
      "status": "Active",
      "injury_status": null,
      "age": 25,
      "years_exp": 3
    }
  ],
  "not_found": ["12469"]
}
```

IDs duplicados são removidos preservando a ordem da primeira ocorrência. IDs
inexistentes são incluídos em `not_found`. A resposta nunca inclui jogadores
que não tenham sido solicitados.

## Cache

O mapa completo é carregado de `https://api.sleeper.app/v1/players/nfl` e fica
em memória por 24 horas. Requisições simultâneas durante uma atualização
compartilham o mesmo download.

Em ambiente serverless, o cache é por instância. Uma nova instância ou cold
start precisa carregar o mapa novamente; não existe garantia de um único cache
global entre regiões. Esse é um compromisso consciente do MVP para evitar
banco, KV ou outro serviço externo.

`get_player_game_logs` carrega os arquivos semanais `stats_player` e
`snap_counts` do nflverse por temporada e os mantém em memória por 6 horas. A
ferramenta aceita até 25 `player_ids`, calcula a pontuação com
`scoring_settings` da liga, retorna médias da temporada, dos últimos três e dos
últimos cinco jogos e inclui utilização ofensiva ou IDP e snap counts. O
mapeamento é conservador: IDs sem correspondência única são retornados em
`unresolved`, e regras não calculáveis aparecem em
`unsupported_scoring_keys`.

Exemplo de argumentos MCP:

```json
{
  "league_id": "1389353930927927296",
  "player_ids": ["11742", "10888", "12567"],
  "season": "2026",
  "through_week": 6,
  "game_log_limit": 5
}
```

`analyze_waiver_candidates` consolida o fluxo de waiver sem uma fonte nova de
valuation. A ferramenta deriva os jogadores livres, aplica a pontuação da liga,
combina produção recente, utilização, tendência e confiabilidade da amostra e
compara o resultado com jogadores não titulares do roster informado. Titulares,
reserve e Taxi Squad ficam fora do conjunto de comparação. A nota é relativa ao
grupo avaliado na chamada e não representa valor Dynasty, projeção futura ou
uma recomendação automática de corte.

```json
{
  "league_id": "1389353930927927296",
  "owner_id": "1050514781800734720",
  "season": "2026",
  "through_week": 6,
  "positions": ["WR"],
  "candidate_pool_size": 25,
  "candidate_limit": 10,
  "comparison_limit": 5
}
```

## Desenvolvimento

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm test
npm run typecheck
```

Não há variáveis de ambiente obrigatórias, portanto `.env.example` não é
necessário nesta versão.

## Deploy na Vercel

1. Crie um projeto Vercel usando esta pasta `middleware` como Root Directory.
2. Faça o deploy sem configurar variáveis de ambiente.
3. Os rewrites de `vercel.json` publicam `/players/resolve` e `/mcp`.
4. A URL de produção configurada nos schemas é
   `https://fantasy-gmassistant-middleware.vercel.app`.

Para uso geral, `openapi.yaml` fornece OpenAPI 3.0.3. Como o GPT Builder usado
nesta integração exigiu OpenAPI 3.1.x, importe `openapi-gpt-action.yaml` na
Action. Configure autenticação como `None`.

As Actions são mantidas apenas como compatibilidade histórica. O fluxo atual
para plugins usa o servidor MCP, sem autenticação neste MVP.

## Testes do MCP

Além dos testes unitários, use o MCP Inspector contra o endpoint publicado:

```bash
npx @modelcontextprotocol/inspector@latest
```

Selecione `Streamable HTTP` e informe:

```text
https://fantasy-gmassistant-middleware.vercel.app/mcp
```

Valide a inicialização, a lista das dezoito ferramentas, entradas inválidas e ao
menos uma chamada real de cada ferramenta.

## Exemplos curl

O exemplo abaixo usa o deployment atual:

```bash
BASE_URL="https://fantasy-gmassistant-middleware.vercel.app"

curl --fail-with-body --silent --show-error \
  -X POST "$BASE_URL/players/resolve" \
  -H "Content-Type: application/json" \
  -d '{"player_ids":["11604","11618","12469"]}'
```

Exemplo com ID inexistente e duplicado:

```bash
curl --fail-with-body --silent --show-error \
  -X POST "$BASE_URL/players/resolve" \
  -H "Content-Type: application/json" \
  -d '{"player_ids":["11604","not-a-real-id","11604"]}'
```

## Respostas de erro

- `400`: JSON inválido ou `player_ids` ausente/inválido.
- `413`: corpo acima de 16 KiB.
- `502`: mapa de jogadores do Sleeper temporariamente indisponível.

## Limites atuais

- Sem autenticação.
- Sem banco de dados ou cache distribuído.
- Sem valuations externas, projections, notícias detalhadas ou operações de escrita.
- Transactions permitem consultar trades e waivers existentes, mas não criar
  propostas, alterar lineups ou enviar claims.
- A disponibilidade de jogadores é derivada dos rosters e ordenada pelo
  `search_rank` do Sleeper; ela não é uma recomendação de valor.
- Game logs e snaps vêm do nflverse e podem ter atraso após o encerramento das
  partidas. A resposta identifica a fonte e qualquer regra de pontuação sem
  cobertura.
- A primeira chamada de cada instância pode ser mais lenta por precisar carregar
  e interpretar o mapa completo e os arquivos da temporada.
