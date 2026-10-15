"""Small dependency-light validation for the Sleeper MVP OpenAPI document."""

from pathlib import Path
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required. Install it with: python -m pip install PyYAML")


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "sleeper-openapi.yaml"
EXPECTED_OPERATIONS = {
    ("/state/nfl", "get"): "getNflState",
    ("/user/{user_identifier}", "get"): "getSleeperUser",
    ("/user/{user_id}/leagues/nfl/{season}", "get"): "listUserNflLeagues",
    ("/league/{league_id}", "get"): "getLeagueDetails",
    ("/league/{league_id}/rosters", "get"): "listLeagueRosters",
    ("/league/{league_id}/users", "get"): "listLeagueMembers",
}


def fail(message: str) -> None:
    raise AssertionError(message)


def resolved_parameters(document: dict, operation: dict) -> list[dict]:
    result = []
    for parameter in operation.get("parameters", []):
        if "$ref" not in parameter:
            result.append(parameter)
            continue
        prefix = "#/components/parameters/"
        reference = parameter["$ref"]
        if not reference.startswith(prefix):
            fail(f"Unsupported parameter reference: {reference}")
        name = reference.removeprefix(prefix)
        result.append(document["components"]["parameters"][name])
    return result


def main() -> None:
    document = yaml.safe_load(SCHEMA_PATH.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        fail("The YAML root must be an object")
    if document.get("openapi") != "3.1.0":
        fail("Expected OpenAPI 3.1.0 for GPT Actions")
    if document.get("servers") != [
        {
            "url": "https://api.sleeper.app/v1",
            "description": "Public Sleeper API",
        }
    ]:
        fail("Unexpected server configuration")
    if "securitySchemes" in document.get("components", {}):
        fail("The public Sleeper API must not declare authentication")
    if "parameters" in document.get("components", {}):
        fail("Parameters must be inline for GPT Actions importer compatibility")
    schema_text = SCHEMA_PATH.read_text(encoding="utf-8")
    if "allOf" in schema_text:
        fail("The MVP schema must not use allOf")
    if "nullable:" in schema_text:
        fail("OpenAPI 3.1 must express null through JSON Schema types, not nullable")

    paths = document.get("paths", {})
    actual_operations = {
        (path, method): operation.get("operationId")
        for path, path_item in paths.items()
        for method, operation in path_item.items()
        if method.lower() in {"get", "post", "put", "patch", "delete"}
    }
    if actual_operations != EXPECTED_OPERATIONS:
        fail(f"Operations differ from the MVP scope: {actual_operations}")

    operation_ids = list(actual_operations.values())
    if len(operation_ids) != len(set(operation_ids)):
        fail("operationId values must be unique")
    for operation_id in operation_ids:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", operation_id or ""):
            fail(f"Invalid operationId: {operation_id!r}")

    for (path, method), _operation_id in EXPECTED_OPERATIONS.items():
        operation = paths[path][method]
        placeholders = set(re.findall(r"{([^}]+)}", path))
        parameters = resolved_parameters(document, operation)
        declared = {
            parameter["name"]
            for parameter in parameters
            if parameter.get("in") == "path" and parameter.get("required") is True
        }
        if placeholders != declared:
            fail(
                f"Path parameters for {method.upper()} {path}: "
                f"expected {placeholders}, got {declared}"
            )
        if "200" not in operation.get("responses", {}):
            fail(f"GET {path} must document a 200 response")

    print("OK: YAML syntax and Sleeper MVP OpenAPI invariants are valid.")


if __name__ == "__main__":
    main()
