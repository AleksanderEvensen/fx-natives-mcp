import Fuse from "fuse.js";
import z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
    InMemoryTaskMessageQueue,
    InMemoryTaskStore,
} from "@modelcontextprotocol/sdk/experimental";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import process from "node:process";
import pkg from "../package.json";
import { ofetch } from "ofetch";
import { destr } from "destr";

const PAGE_SIZE = 10;
const RDR_NATIVES_URL =
    "https://raw.githubusercontent.com/VORPCORE/RDR3natives/main/rdr3natives.json";
const FIVEM_NATIVES_URL = "https://static.cfx.re/natives/natives.json";
const CFX_NATIVES_URL = "https://runtime.fivem.net/doc/natives_cfx.json";
const GAME: "redm" | "fivem" = "redm";

const NativeParamSchema = z.object({
    name: z.string(),
    type: z.string(),
});

const NativeSchema = z.object({
    name: z.string(),
    comment: z.string(),
    params: z.array(NativeParamSchema),
    return_type: z.string(),
});

const NamespacesSchema = z.record(
    z.string(),
    z.record(z.string(), NativeSchema),
);
type Native = z.infer<typeof NativeSchema>;
type Namespaces = z.infer<typeof NamespacesSchema>;

console.error("Fetching natives...");
const NATIVES_DATA: Record<string, any> = destr(
    await ofetch(GAME === "redm" ? RDR_NATIVES_URL : FIVEM_NATIVES_URL),
);
console.error("Fetching CFX Natives...");
const CFX_NATIVES = destr(await ofetch(CFX_NATIVES_URL));

function transformCfxNatives(data: unknown) {
    if (typeof data !== "object" || data == null) return undefined;
    if (!("CFX" in data)) return undefined;

    const cfxNamespace = data.CFX;

    if (typeof cfxNamespace !== "object" || cfxNamespace == null)
        return undefined;

    const natives: Record<string, Native> = {};

    Object.entries(cfxNamespace).forEach(([hash, native]) => {
        if (typeof native !== "object" || data == null) return;

        const name = "name" in native ? String(native.name) : "";
        const comment =
            "description" in native ? String(native.description) : "";
        const params =
            "params" in native && Array.isArray(native.params)
                ? native.params
                : [];
        const return_type = "results" in native ? String(native.results) : "";

        natives[hash] = {
            name,
            comment,
            params,
            return_type,
        };
    });

    return {
        CFX: natives,
    };
}

const data = {
    ...transformCfxNatives(CFX_NATIVES),
    ...(GAME === "redm" ? NATIVES_DATA : transformCfxNatives(NATIVES_DATA)),
};

console.error("Parsing natives...");
let { error: parseError, data: parsed } = NamespacesSchema.safeParse(data);

if (parseError || !parsed) {
    console.error("Failed to parse natives");
    if (parseError) {
        console.error(parseError.message);
    }
    process.exit(1);
}

const paramTypes = new Set<string>();

function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.toLowerCase().slice(1);
}

function sanitizeMethodName(str: string) {
    if (str.toLowerCase().startsWith("0x")) {
        return `_${str}`;
    }
    if (str.startsWith("_0x")) return str;

    return str
        .split("_")
        .map((word) => capitalize(word))
        .join("");
}

const RESERVED_WORDS = new Set([
    // TS
    "break",
    "as",
    "any",
    "case",
    "implements",
    "boolean",
    "catch",
    "interface",
    "constructor",
    "class",
    "let",
    "declare",
    "const",
    "package",
    "get",
    "continue",
    "private",
    "module",
    "debugger",
    "protected",
    "require",
    "default",
    "public",
    "number",
    "delete",
    "static",
    "set",
    "do",
    "yield",
    "string",
    "else",
    "symbol",
    "enum",
    "type",
    "export",
    "from",
    "extends",
    "of",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "new",
    "null",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",

    // LUA
    "end",
    "reapeat",
    "nil",
]);

const SHARED_TYPE_MAP: Record<string, string> = {
    "const char*": "string",
    "char*": "string",
    bool: "boolean",
    int: "number",
    float: "number",
};

const TYPESCRIPT_TYPE_MAP: Record<string, string> = {
    ...SHARED_TYPE_MAP,
    object: "any",
    any: "any",
    vector3: "[number, number, number]",
};

const LUA_TYPE_MAP: Record<string, string> = {
    ...SHARED_TYPE_MAP,
    vector3: "vec3",
    object: "table",
};

function sanitizeReservedWords(name: string) {
    return RESERVED_WORDS.has(name) ? "_" + name : name;
}

function unindent(text: string) {
    const minSpaces = text
        .split("\n")
        .slice(1)
        .reduce((minSpaces, line) => {
            if (!line.trim()) return minSpaces;
            // count spaces until first character

            let i = 0;
            for (i = 0; i < line.length; i++) {
                if (line.charAt(i) != " ") {
                    return Math.min(minSpaces, i);
                }
            }
            return Math.min(minSpaces, i);
        }, 999999);

    return text
        .split("\n")
        .map((line, i) => {
            if (i === 0) return line;
            return line.slice(minSpaces);
        })
        .filter((line) => line.trim() != "")
        .join("\n");
}

function sanitizeType(type: string, lang: "TS" | "Lua") {
    if (lang === "TS") {
        const mapped = TYPESCRIPT_TYPE_MAP[type.toLowerCase()] ?? type;
        if (mapped.endsWith("*")) {
            return mapped.slice(0, -1);
        }
        return mapped;
    } else {
        const mapped = LUA_TYPE_MAP[type.toLowerCase()] ?? type;
        if (mapped.endsWith("*")) {
            return mapped.slice(0, -1);
        }
        return mapped;
    }
}

function createDescriptor(lang: "TS" | "Lua", native: Native) {
    const [fnParams, pointers] = native.params.reduce<
        [Native["params"], Native["params"]]
    >(
        ([params, pointers], param) => {
            if (
                param.type.endsWith("*") &&
                param.type.toLowerCase() !== "char*" &&
                param.type.toLowerCase() !== "const char*"
            ) {
                pointers.push(param);
            } else {
                params.push(param);
            }
            return [params, pointers];
        },
        [[], []],
    );

    if (lang == "TS") {
        const params = fnParams.map((param) => {
            const paramType = sanitizeType(param.type, "TS");
            if (param.name == "...") {
                return `...args: any[]`;
            }
            paramTypes.add(paramType);
            return `${sanitizeReservedWords(param.name)}: ${paramType}`;
        });

        const returnType = [
            ...(native.return_type != ""
                ? [`retreval: ${sanitizeType(native.return_type, "TS")}`]
                : []),
            ...pointers.map(
                (v) =>
                    `${sanitizeReservedWords(v.name)}: ${sanitizeType(v.type.slice(0, -1), "TS")}`,
            ),
        ];

        const stringifiedReturnType =
            returnType.length === 0
                ? "void"
                : returnType.length == 1
                  ? (returnType[0]?.split(": ")[1] ?? "void")
                  : `[${returnType.join(", ")}]`;

        return `function ${sanitizeMethodName(native.name)}(${params.join(", ")}): ${stringifiedReturnType};`;
    } else if (lang == "Lua") {
        const typeDocParams = fnParams.map((param) => {
            const type = LUA_TYPE_MAP[param.type.toLowerCase()] ?? param.type;
            const paramName = sanitizeReservedWords(param.name);
            return `---@param ${paramName} ${type}`;
        });
        const paramNames = fnParams.map((param) =>
            sanitizeReservedWords(param.name),
        );

        const returnTypes = [
            ...(native.return_type != ""
                ? [sanitizeType(native.return_type, "Lua")]
                : []),
            ...pointers.map((v) =>
                sanitizeType(v.type.replaceAll("*", ""), "Lua"),
            ),
        ];

        const returnVariables = [
            ...(native.return_type != ""
                ? [sanitizeReservedWords("retreval")]
                : []),
            ...pointers.map((v) => sanitizeReservedWords(v.name)),
        ];

        return (
            typeDocParams.join("\n") +
            unindent(`
                ---@return ${returnTypes.join(", ")}
                local ${returnVariables.join(", ")} = ${sanitizeMethodName(native.name)}(${paramNames.join(", ")})
            `)
        );
    } else {
        throw new Error(`Unsupported language: ${lang}`);
    }
}

function convertToNativeDoc(namespace: string, hash: string, native: Native) {
    return {
        hash,
        ns: namespace,
        name: native.name,
        typescript: createDescriptor("TS", native),
        lua: createDescriptor("Lua", native),
        comment: native.comment,
    };
}

const allNatives = Object.entries(parsed).flatMap(([namespace, nativeMap]) => {
    return Object.entries(nativeMap).map(([hash, native]) => {
        return convertToNativeDoc(namespace, hash, native);
    });
});

const nativeIndex = new Fuse(allNatives, {
    keys: ["typescript", "name", "ns", "comment"],
    includeMatches: true,
    includeScore: true,
    isCaseSensitive: false,
});

const taskStore = new InMemoryTaskStore();

const mcpServer = new McpServer(
    {
        name: pkg.name,
        version: pkg.version,
    },
    {
        taskStore,
        taskMessageQueue: new InMemoryTaskMessageQueue(),
    },
);

mcpServer.registerTool(
    "search-native",
    {
        title: "Search for cfx native methods",
        description:
            "Takes a fuzzy search query as parameter and returns a list of matching natives and their hashes",
        inputSchema: {
            query: z.string().describe("Fuzzy search query for native method"),
            page: z
                .number()
                .min(1)
                .optional()
                .default(1)
                .describe("Page number to display (default: 1)"),
        },
    },
    ({ query, page }) => {
        const results = nativeIndex.search(query);

        const data = results.map((v) => `${v.item.hash} ${v.item.name}`);

        const totalPages = Math.ceil(results.length / PAGE_SIZE);
        const startIndex = (page - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, results.length);
        const currentPageData = data.slice(startIndex, endIndex);

        return {
            content: [
                {
                    type: "text",
                    text: `Found ${results.length} (Showing page ${page}/${totalPages}) matches (hash, method name):\n${currentPageData.join("\n")}`,
                },
            ],
        };
    },
);

mcpServer.registerTool(
    "get-native-doc",
    {
        title: "Get native by name or hash",
        description:
            "Takes an exact native method name or hash, and returns the provided documentation for said native",
        inputSchema: {
            hashOrName: z.string().describe("Exact native hash or name"),
        },
    },
    ({ hashOrName }) => {
        const searchTrimmed = hashOrName.trim().toLowerCase();
        const native = allNatives.find((n) => {
            const trimmedHash = n.hash.trim().toLowerCase();
            const trimmedName = n.name.trim().toLowerCase();

            return [trimmedHash, trimmedName].includes(searchTrimmed);
        });

        if (!native) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Native with hash or name '${hashOrName}'`,
                    },
                ],
            };
        }

        const TSDoc = "```ts\n" + native.typescript + "\n```";
        const LUADoc = "```lua\n" + native.lua + "\n```";

        const documentation = `Usage:\n\nTypeScript:\n${TSDoc}\n\nLua:\n${LUADoc}\n`;

        const fullDocumentation = documentation + "\n\n" + native.comment;

        return {
            content: [
                {
                    type: "text",
                    text: fullDocumentation,
                },
            ],
        };
    },
);

const transport = new StdioServerTransport(process.stdin, process.stdout);

console.error("Starting MCP server");

mcpServer.connect(transport);
