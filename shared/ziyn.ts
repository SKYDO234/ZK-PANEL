import { z } from "zod";
export const variableSchema = z.object({
  key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/),
  label: z.string().min(1).max(100),
  default: z.string().max(4000),
  description: z.string().max(500).optional(),
  required: z.boolean().optional(),
  secret: z.boolean().optional(),
  rules: z.string().max(240).optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
});
export const ziynSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,80}$/),
  name: z.string().min(2).max(60),
  kind: z.enum(["minecraft", "game", "container", "website", "bot"]),
  description: z.string().max(1000),
  version: z.string().max(30),
  author: z.string().max(100),
  image: z
    .string()
    .min(3)
    .max(250)
    .regex(/^[a-zA-Z0-9._/:@-]+$/),
  command: z.array(z.string().max(4000)).max(20),
  stopCommand: z.string().max(100),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]),
  variables: z.array(variableSchema).max(50),
  tags: z.array(z.string().max(50)).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(30),
  enabled: z.boolean(),
  source: z.string().max(250),
  features: z.array(z.string().max(100)).max(10),
});
export function parseZiynDocument(raw: unknown) {
  if (!raw || typeof raw !== "object")
    throw new Error("Expected a ZIYN JSON object.");
  const input = raw as Record<string, any>;
  if (input.meta?.version === "ZIYN_v1") {
    const { meta, ...rest } = input;
    return ziynSchema.parse({ ...rest, enabled: false });
  }
  if (!["PTDL_v1", "PTDL_v2"].includes(input.meta?.version))
    throw new Error("Expected ZIYN_v1 or a legacy PTDL_v1/v2 export.");
  const image =
    Object.values(input.docker_images || {})[0] ||
    input.images?.[0] ||
    input.image;
  if (typeof image !== "string")
    throw new Error("The legacy template has no Docker image.");
  const variables = Array.isArray(input.variables) ? input.variables : [];
  return ziynSchema.parse({
    id: "ziyn-" + crypto.randomUUID().replaceAll("-", "").slice(0, 16),
    name: String(input.name || "Imported ZIYN"),
    kind: "container",
    description: String(
      input.description ||
        "Imported for administrator review. Legacy installation scripts are not run.",
    ),
    version: "1.0.0",
    author: String(input.author || "Community"),
    image,
    command: [
      "sh",
      "-c",
      String(
        input.startup || 'echo "Configure startup before enabling this ZIYN."',
      ),
    ],
    stopCommand: String(input.config?.stop || "stop"),
    port: 25565,
    protocol: "tcp",
    variables: variables.slice(0, 50).map((v: any) => ({
      key: String(v.env_variable || ""),
      label: String(v.name || v.env_variable || "Variable"),
      default: String(v.default_value ?? ""),
      description: String(v.description || "").slice(0, 500),
      required: String(v.rules || "")
        .split("|")
        .includes("required"),
      secret: false,
      rules:
        String(v.rules || "")
          .split("|")
          .find((r: string) => r.startsWith("regex:"))
          ?.slice(6) || undefined,
    })),
    tags: ["Imported", "Review required"],
    color: "#9cb6d0",
    icon: "box",
    enabled: false,
    source:
      "Imported legacy template · " +
      String(input.meta?.update_url || "local file").slice(0, 180),
    features: ["Manual installation required", "Review startup and image"],
  });
}
