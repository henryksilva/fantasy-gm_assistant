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

Ele expõe sete ferramentas somente leitura:

- `get_nfl_state`
- `get_sleeper_user`
- `list_user_nfl_leagues`
- `get_league_details`
- `list_league_rosters`
- `list_league_members`
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

Valide a inicialização, a lista das sete ferramentas, entradas inválidas e ao
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

## Limites do MVP

- Sem autenticação.
- Sem banco de dados ou cache distribuído.
- Sem trades, valuations, usuários ou outros endpoints Sleeper.
- O MCP não implementa transactions, matchups, drafts, traded picks, trending
  players ou operações de escrita.
- A primeira chamada de cada instância pode ser mais lenta por precisar carregar
  e interpretar o mapa completo.
