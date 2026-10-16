# Fantasy Assist GM + Sleeper — MVP

Base técnica mínima para conectar o plugin Fantasy Assist GM à API pública do
Sleeper por um servidor MCP, mantendo os schemas de GPT Actions como legado de
migração. O MVP não usa autenticação, banco de dados ou valuations externas.

## Integração atual por plugin

O endpoint `https://fantasy-gmassistant-middleware.vercel.app/mcp` implementa
MCP Streamable HTTP e expõe dezoito ferramentas somente leitura. Além do
escopo básico, a versão estendida cobre matchups, transactions, picks
negociadas, drafts, playoffs, trending players e disponibilidade derivada de
waivers. A ferramenta de game logs usa dados semanais do nflverse para calcular
pontuação pelas regras da liga e tendências de utilização sem depender de o
jogador ter pertencido a um roster. O calendário semanal do mesmo provedor
diferencia BYE de jogo agendado sem estatística. O pacote combinado de plugin está em
`plugin/`:

```text
plugin/
├── .app.json
├── plugin.json
├── mcp.json
└── skills/
    └── fantasy-assist-gm-sleeper/
        └── SKILL.md
```

A skill diferencia explicitamente os recursos disponíveis dos recursos futuros
e impede associação de `player_id` por suposição.

As onze ferramentas estendidas são:

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

O catálogo local em `.agents/plugins/marketplace.json` permite descobrir e
instalar este pacote no ChatGPT desktop durante os testes.

## Middleware de jogadores

O middleware serverless para resolver `player_id` sem enviar o mapa
completo à GPT Action está em `middleware/`. Consulte `middleware/README.md`
para execução, testes, deploy na Vercel e schemas OpenAPI do endpoint
`POST /players/resolve`.

## Escopo legado das GPT Actions

O arquivo `sleeper-openapi.yaml` expõe somente seis operações leves de leitura:

| `operationId` | Uso |
| --- | --- |
| `getNflState` | Descobre a temporada, semana e `league_season` atuais. |
| `getSleeperUser` | Resolve um username ou `user_id` e retorna o usuário. |
| `listUserNflLeagues` | Lista as ligas NFL de um `user_id` em uma temporada. |
| `getLeagueDetails` | Busca os detalhes de uma liga. |
| `listLeagueRosters` | Lista os rosters de uma liga. |
| `listLeagueMembers` | Lista os usuários/membros de uma liga. |

Base URL: `https://api.sleeper.app/v1`

A API do Sleeper é pública e somente leitura. Portanto, esta Action deve ser
configurada com **Authentication: None**. O schema não declara `securitySchemes`.

O arquivo `middleware/openapi-gpt-action.yaml` expõe separadamente
`resolveSleeperPlayers`. Essa operação aceita até 100 `player_id` e devolve
somente os jogadores solicitados, evitando `ResponseTooLargeError`.

## Arquivos

```text
.
├── README.md
├── sleeper-openapi.yaml
├── examples/
│   └── requests.http
├── tests/
│   └── validate_openapi.py
├── middleware/
    ├── openapi-gpt-action.yaml
    ├── openapi.yaml
    ├── api/
    ├── src/
    └── tests/
└── plugin/
    ├── .app.json
    ├── plugin.json
    ├── mcp.json
    └── skills/
```

## Configuração do plugin

O pacote em `plugin/` aponta para o endpoint MCP de produção e para o
aplicativo MCP registrado no ChatGPT. O vínculo usa `plugin/.app.json`, enquanto
`plugin/mcp.json` preserva a configuração MCP portátil para clientes
compatíveis. A conexão não exige autenticação nesta versão.

## Configuração no GPT personalizado

> Legado: Custom Actions não são transferidas para plugins. Estes schemas
> continuam no repositório para referência e para o GPT original enquanto ele
> permanecer disponível.

1. Abra a configuração do GPT e adicione uma Action para a API pública.
2. Importe ou cole o conteúdo de `sleeper-openapi.yaml`.
3. Selecione autenticação `None` e confirme as seis operações.
4. Adicione uma segunda Action para o resolver de jogadores.
5. Importe `middleware/openapi-gpt-action.yaml` e selecione autenticação `None`.
6. Confirme a operação `resolveSleeperPlayers`.
7. Em produção, publique uma URL de política de privacidade apropriada ao uso.

O schema usa OpenAPI 3.1.0, uma única origem HTTPS, IDs como strings para não
perder precisão e objetos flexíveis apenas onde o Sleeper usa chaves variáveis.

## Exemplos de uso pelo GPT

Perguntas que o GPT deve conseguir atender usando apenas estas operações:

```text
Qual temporada e semana da NFL o Sleeper considera atuais?
```

Fluxo esperado: `getNflState()`.

```text
Busque o usuário Sleeper HenrykManente.
```

Fluxo esperado: `getSleeperUser(user_identifier="HenrykManente")`.

```text
Liste minhas ligas NFL de 2026.
```

Fluxo esperado:

1. Chamar `getNflState` e usar o `league_season` retornado.
2. Se necessário, chamar `getSleeperUser` com `HenrykManente`.
3. Chamar `listUserNflLeagues` com `user_id="1050514781800734720"` e a temporada descoberta.

```text
Mostre os detalhes da liga <league_id> e associe cada roster ao seu membro.
```

Fluxo esperado: chamar `getLeagueDetails`, `listLeagueRosters` e
`listLeagueMembers` com o mesmo `league_id`; depois relacionar
`roster.owner_id` a `member.user_id`.

```text
Resolva estes player_ids do roster para nomes: 11604, 11618 e 12469.
```

Fluxo esperado: chamar `resolveSleeperPlayers` com apenas os IDs solicitados. O
GPT não deve chamar diretamente `GET /players/nfl`, pois a resposta é grande
demais para uma Action.

## Testes manuais com curl

Os exemplos abaixo não usam token nem header de autenticação.

### 1. Descobrir o estado atual da NFL

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/state/nfl"
```

Use `league_season` para listar as ligas da temporada ativa.

### 2. Buscar o usuário pelo username

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/user/HenrykManente"
```

O campo `user_id` esperado é `1050514781800734720`.

### 3. Buscar o mesmo usuário pelo user_id

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/user/1050514781800734720"
```

### 4. Listar ligas NFL em uma temporada

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/user/1050514781800734720/leagues/nfl/2026"
```

Se a resposta for `[]`, tente uma temporada em que o usuário tenha participado,
por exemplo `2025`. Copie um `league_id` da resposta para os próximos testes.

### 5. Buscar detalhes de uma liga

```bash
LEAGUE_ID="substitua_pelo_league_id"
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}"
```

### 6. Buscar rosters da liga

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters"
```

### 7. Buscar membros da liga

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}/users"
```

No PowerShell, defina a variável com `$env:LEAGUE_ID = "..."` e use
`$env:LEAGUE_ID` na URL, ou substitua o ID diretamente.

### 8. Resolver player_ids com payload compacto

```bash
curl --fail-with-body --silent --show-error \
  -X POST "https://fantasy-gmassistant-middleware.vercel.app/players/resolve" \
  -H "Content-Type: application/json" \
  -d '{"player_ids":["11604","11618","12469"]}'
```

## Validação local do schema

O teste verifica sintaxe YAML, estrutura OpenAPI básica, endpoints permitidos,
parâmetros de path, unicidade dos `operationId` e ausência de autenticação.

```bash
python -m pip install PyYAML
python tests/validate_openapi.py
```

O arquivo `examples/requests.http` também pode ser executado por clientes HTTP
compatíveis com o formato `.http`.

## Validação do servidor MCP

```bash
cd middleware
pnpm install
pnpm run typecheck
pnpm test
npx @modelcontextprotocol/inspector@latest
```

No Inspector, conecte a
`https://fantasy-gmassistant-middleware.vercel.app/mcp` usando Streamable HTTP.

## Decisões e limites

- IDs do Sleeper são strings, evitando perda de precisão em ambientes JavaScript.
- `settings`, `metadata` e campos semelhantes aceitam chaves adicionais porque o
  Sleeper varia esses objetos entre ligas e temporadas.
- O middleware mantém o mapa de jogadores em memória por instância por 24 horas.
- Estatísticas semanais e snap counts do nflverse ficam em memória por instância
  por 6 horas, junto com o calendário usado para identificar semanas de BYE.
- Não há persistência, cache distribuído nem valuations externas.
- O mapa completo de jogadores não é exposto à GPT Action; use o resolver compacto.
- Os schemas de GPT Actions continuam limitados ao MVP legado; os recursos
  estendidos estão disponíveis no servidor MCP do plugin.
- Disponibilidade no waiver é derivada dos rosters atuais. O ranking agregado é
  relativo ao conjunto avaliado e não representa valuation de mercado.
- `analyze_waiver_candidates` compara free agents com jogadores não titulares,
  protegendo starters, reserve e Taxi Squad. A comparação é estatística e não
  deve ser apresentada como recomendação automática de corte.
- `get_player_game_logs` limita a consulta a 25 jogadores, retorna no máximo oito
  game logs por jogador e informa regras de pontuação não suportadas em vez de
  apresentar precisão falsa. `week_context` diferencia BYE, jogo agendado sem
  estatística e indisponibilidade dos dados.
- O plugin não oferece projections, valuations externas nem operações de escrita.
- O Sleeper recomenda manter o uso abaixo de 1.000 chamadas por minuto.
- A documentação do Sleeper informa uso gratuito para fins não comerciais; uso
  comercial deve ser tratado diretamente com o Sleeper.

## Referências

- [Documentação oficial da API Sleeper](https://docs.sleeper.com/)
- [Dados automatizados do nflverse](https://github.com/nflverse/nflverse-data)
- [OpenAI Platform](https://platform.openai.com/)
