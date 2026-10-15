# Sleeper GPT Action — MVP

Base técnica mínima para conectar um GPT personalizado diretamente à API REST
pública do Sleeper, sem backend, autenticação, banco de dados ou lógica própria
de Fantasy Football.

## Middleware de jogadores

O middleware serverless opcional para resolver `player_id` sem enviar o mapa
completo à GPT Action está em `middleware/`. Consulte `middleware/README.md`
para execução, testes, deploy na Vercel e schemas OpenAPI do endpoint
`POST /players/resolve`.

## Escopo

O arquivo `sleeper-openapi.yaml` expõe somente sete operações de leitura:

| `operationId` | Uso |
| --- | --- |
| `getNflState` | Descobre a temporada, semana e `league_season` atuais. |
| `getNflPlayers` | Resolve `player_id` para nomes e dados básicos, com filtros opcionais. |
| `getSleeperUser` | Resolve um username ou `user_id` e retorna o usuário. |
| `listUserNflLeagues` | Lista as ligas NFL de um `user_id` em uma temporada. |
| `getLeagueDetails` | Busca os detalhes de uma liga. |
| `listLeagueRosters` | Lista os rosters de uma liga. |
| `listLeagueMembers` | Lista os usuários/membros de uma liga. |

Base URL: `https://api.sleeper.app/v1`

A API do Sleeper é pública e somente leitura. Portanto, esta Action deve ser
configurada com **Authentication: None**. O schema não declara `securitySchemes`.

## Arquivos

```text
.
├── README.md
├── sleeper-openapi.yaml
├── examples/
│   └── requests.http
└── tests/
    └── validate_openapi.py
```

## Configuração no GPT personalizado

1. Abra a configuração do GPT e adicione uma nova Action.
2. Importe ou cole o conteúdo de `sleeper-openapi.yaml`.
3. Selecione autenticação `None`.
4. Confirme que as sete operações foram reconhecidas sem warnings.
5. Em produção, publique uma URL de política de privacidade apropriada ao seu uso.

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
Resolva os player_ids dos quarterbacks ativos para nomes.
```

Fluxo esperado: chamar `getNflPlayers(position="QB", active=true)`. O mapa
completo sem filtros é grande e não deve ser solicitado repetidamente.

## Testes manuais com curl

Os exemplos abaixo não usam token nem header de autenticação.

### 1. Descobrir o estado atual da NFL

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/state/nfl"
```

Use `league_season` para listar as ligas da temporada ativa.

### 2. Buscar jogadores ativos por posição

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/players/nfl?position=QB&active=true"
```

O endpoint sem filtros retorna um mapa grande, próximo de 5 MB segundo o
Sleeper, e não deve ser chamado repetidamente. Prefira `position` e `active`
sempre que possível.

### 3. Buscar o usuário pelo username

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/user/HenrykManente"
```

O campo `user_id` esperado é `1050514781800734720`.

### 4. Buscar o mesmo usuário pelo user_id

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/user/1050514781800734720"
```

### 5. Listar ligas NFL em uma temporada

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/user/1050514781800734720/leagues/nfl/2026"
```

Se a resposta for `[]`, tente uma temporada em que o usuário tenha participado,
por exemplo `2025`. Copie um `league_id` da resposta para os próximos testes.

### 6. Buscar detalhes de uma liga

```bash
LEAGUE_ID="substitua_pelo_league_id"
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}"
```

### 7. Buscar rosters da liga

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters"
```

### 8. Buscar membros da liga

```bash
curl --fail-with-body --silent --show-error \
  "https://api.sleeper.app/v1/league/${LEAGUE_ID}/users"
```

No PowerShell, defina a variável com `$env:LEAGUE_ID = "..."` e use
`$env:LEAGUE_ID` na URL, ou substitua o ID diretamente.

## Validação local do schema

O teste verifica sintaxe YAML, estrutura OpenAPI básica, endpoints permitidos,
parâmetros de path, unicidade dos `operationId` e ausência de autenticação.

```bash
python -m pip install PyYAML
python tests/validate_openapi.py
```

O arquivo `examples/requests.http` também pode ser executado por clientes HTTP
compatíveis com o formato `.http`.

## Decisões e limites do MVP

- IDs do Sleeper são strings, evitando perda de precisão em ambientes JavaScript.
- `settings`, `metadata` e campos semelhantes aceitam chaves adicionais porque o
  Sleeper varia esses objetos entre ligas e temporadas.
- Não há middleware, cache, persistência, valuations externas ou regra de negócio.
- O mapa completo de jogadores é grande; use filtros e evite chamadas repetidas.
- O schema não inclui transactions, matchups, drafts, traded picks ou trending players.
- O Sleeper recomenda manter o uso abaixo de 1.000 chamadas por minuto.
- A documentação do Sleeper informa uso gratuito para fins não comerciais; uso
  comercial deve ser tratado diretamente com o Sleeper.

## Referências

- [Documentação oficial da API Sleeper](https://docs.sleeper.com/)
- [OpenAI Platform](https://platform.openai.com/)
