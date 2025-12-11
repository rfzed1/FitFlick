import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuração de variáveis de ambiente
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IMAGE_MODEL = process.env.GEMINI_MODEL_IMAGE || "gemini-2.5-flash-image";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Validação da API key
if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY não está definida no .env!");
    console.error("⚠️  O backend vai iniciar, mas as chamadas ao Gemini vão falhar.");
} else {
    console.log("✅ GEMINI_API_KEY está configurada.");
}

console.log("🖼️  Modelo de imagem configurado:", IMAGE_MODEL);

// Flag para modo mock (desenvolvimento sem quota)
const USE_MOCK_AI = process.env.USE_MOCK_AI === "true";
console.log("🧪 Modo mock de IA ativado?", USE_MOCK_AI);

// Validação das variáveis do Supabase
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não definidos no .env!");
} else {
    console.log("✅ Supabase configurado com URL e Service Key.");
}

// Inicializa o cliente do Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Inicializa o cliente do Google GenAI
const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
});

// Configura o Multer para salvar arquivos temporariamente na pasta uploads/
const upload = multer({ dest: "uploads/" });

// Imagem fallback para testes (pixel branco 1x1 PNG)
const FALLBACK_IMAGE_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

// Função utilitária: lê um arquivo do disco e retorna em base64
function fileToBase64(path) {
    const data = fs.readFileSync(path);
    return data.toString("base64");
}

// ============================================
// SISTEMA DE AUTENTICAÇÃO (Supabase)
// ============================================

// Secret para JWT (em produção, use .env)
const JWT_SECRET = process.env.JWT_SECRET || "fitflick_secret_key_change_in_production";

// Função simples para criar token JWT (sem biblioteca externa)
function generateToken(userData) {
    // Token simples: base64(userData:timestamp)
    const payload = JSON.stringify({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        timestamp: Date.now()
    });
    const token = Buffer.from(payload).toString('base64');
    return token;
}

// Função para verificar token
function verifyToken(token) {
    try {
        const payload = Buffer.from(token, 'base64').toString('utf-8');
        const data = JSON.parse(payload);
        return data;
    } catch {
        return null;
    }
}

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        console.log("📝 Registro de novo usuário:", { name, email, phone });

        // Validações
        if (!name || !email || !password || !phone) {
            return res.status(400).json({
                success: false,
                error: "Nome, e-mail, celular e senha são obrigatórios."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: "A senha deve ter pelo menos 6 caracteres."
            });
        }

        // Validação simples de celular
        const numericPhone = phone.replace(/\D/g, "");
        if (numericPhone.length < 8) {
            return res.status(400).json({
                success: false,
                error: "Informe um número de celular válido."
            });
        }

        // Verifica se e-mail já existe no Supabase
        const { data: existingUser, error: existingError } = await supabase
            .from("users")
            .select("id")
            .eq("email", email.toLowerCase())
            .maybeSingle();

        if (existingError) {
            console.error("Erro ao consultar usuário existente:", existingError);
            return res.status(500).json({
                success: false,
                error: "Erro ao verificar usuário existente."
            });
        }

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: "Já existe um usuário cadastrado com esse email."
            });
        }

        // Hash da senha (simplificado - em produção use bcrypt)
        const passwordHash = password; // TODO: usar bcrypt

        // Insere novo usuário no Supabase
        const { data: insertedUser, error: insertError } = await supabase
            .from("users")
            .insert([
                {
                    name,
                    email: email.toLowerCase(),
                    phone,
                    password_hash: passwordHash,
                    plan: "free",
                },
            ])
            .select("id, name, email, phone, created_at, plan")
            .single();

        if (insertError) {
            console.error("Erro ao inserir usuário no Supabase:", insertError);
            return res.status(500).json({
                success: false,
                error: "Erro ao registrar usuário."
            });
        }

        // Gera token
        const token = generateToken({
            id: insertedUser.id,
            email: insertedUser.email,
            name: insertedUser.name
        });

        console.log("✅ Usuário criado com sucesso:", insertedUser.id);

        // Retorna usuário
        res.json({
            success: true,
            token,
            user: {
                id: insertedUser.id,
                name: insertedUser.name,
                email: insertedUser.email,
                phone: insertedUser.phone,
                plan: insertedUser.plan,
                createdAt: insertedUser.created_at,
            }
        });

    } catch (error) {
        console.error("❌ Erro ao registrar usuário:", error);
        res.status(500).json({
            success: false,
            error: "Erro ao criar conta. Tente novamente."
        });
    }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log("🔑 Tentativa de login:", email);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "E-mail e senha são obrigatórios."
            });
        }

        // Busca usuário no Supabase
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id, name, email, phone, password_hash, created_at, plan")
            .eq("email", email.toLowerCase())
            .maybeSingle();

        if (userError) {
            console.error("Erro ao buscar usuário:", userError);
            return res.status(500).json({
                success: false,
                error: "Erro ao processar login."
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Usuário não encontrado ou senha inválida."
            });
        }

        // Compara senha (simplificado - em produção use bcrypt.compareSync)
        if (user.password_hash !== password) {
            return res.status(401).json({
                success: false,
                error: "E-mail ou senha incorretos."
            });
        }

        // Gera token
        const token = generateToken({
            id: user.id,
            email: user.email,
            name: user.name
        });

        console.log("✅ Login bem-sucedido:", user.id);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                plan: user.plan,
                createdAt: user.created_at,
            }
        });

    } catch (error) {
        console.error("❌ Erro ao fazer login:", error);
        res.status(500).json({
            success: false,
            error: "Erro ao fazer login. Tente novamente."
        });
    }
});

// GET /api/auth/me - Retorna dados do usuário logado
app.get("/api/auth/me", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: "Token não fornecido."
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        if (!decoded || !decoded.id) {
            return res.status(401).json({
                success: false,
                error: "Token inválido."
            });
        }

        // Busca usuário no Supabase pelo ID
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id, name, email, phone, created_at, plan")
            .eq("id", decoded.id)
            .maybeSingle();

        if (userError) {
            console.error("Erro ao buscar dados do usuário:", userError);
            return res.status(500).json({
                success: false,
                error: "Erro ao buscar dados do usuário."
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Usuário não encontrado."
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                plan: user.plan,
                createdAt: user.created_at,
            }
        });

    } catch (error) {
        console.error("❌ Erro ao buscar dados do usuário:", error);
        res.status(500).json({
            success: false,
            error: "Erro ao buscar dados do usuário."
        });
    }
});

/**
 * Rota principal da IA de provador:
 * POST /api/generate-look
 * Campos (form-data):
 *  - userImage: arquivo de imagem da pessoa
 *  - clothesImage: arquivo de imagem da roupa
 *  - pieceType: string (top, bottom, swimwear, dress_set)
 */
app.post(
    "/api/generate-look",
    upload.fields([
        { name: "userImage", maxCount: 1 },
        { name: "clothesImage", maxCount: 1 },
    ]),
    async (req, res) => {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📥 Requisição recebida em /api/generate-look");

        try {
            const pieceType = req.body.pieceType || "look";
            const userImage = req.files["userImage"]?.[0];
            const clothesImage = req.files["clothesImage"]?.[0];

            console.log("📋 Dados recebidos:");
            console.log("   - pieceType:", pieceType);
            console.log("   - userImage path:", userImage?.path || "❌ NÃO ENVIADA");
            console.log("   - clothesImage path:", clothesImage?.path || "❌ NÃO ENVIADA");
            console.log("   - GEMINI_API_KEY configurada?", !!GEMINI_API_KEY);

            if (!userImage || !clothesImage) {
                console.error("❌ Validação falhou: imagens faltando");
                return res.status(400).json({
                    success: false,
                    error: "Faltam imagens (userImage ou clothesImage).",
                });
            }

            console.log("🔄 Convertendo imagens para base64...");
            // Converte arquivos enviados para base64
            const userBase64 = fileToBase64(userImage.path);
            const clothesBase64 = fileToBase64(clothesImage.path);
            console.log("✅ Imagens convertidas com sucesso");
            console.log("   - userBase64 length:", userBase64.length);
            console.log("   - clothesBase64 length:", clothesBase64.length);

            // Modo mock: retorna fallback sem chamar IA
            if (USE_MOCK_AI) {
                console.log("🧪 USE_MOCK_AI=true -> retornando imagem mock sem chamar a IA real.");

                // Limpa arquivos temporários
                fs.unlinkSync(userImage.path);
                fs.unlinkSync(clothesImage.path);

                return res.json({
                    success: true,
                    isMock: true,
                    mimeType: "image/png",
                    imageBase64: FALLBACK_IMAGE_BASE64,
                });
            }

            // Monta o prompt com texto + imagens
            const promptParts = [
                {
                    text: `
Você é um modelo de imagem de moda. Use as imagens abaixo para criar UMA ÚNICA IMAGEM:
- A primeira imagem é a pessoa (usuário).
- A segunda imagem é a roupa (print/foto da peça).
Gere uma imagem realista da pessoa vestindo essa roupa.
Tipo de peça: ${pieceType}.
Mostre o caimento da peça de forma natural, estilo foto de provador moderno.
                    `.trim(),
                },
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: userBase64,
                    },
                },
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: clothesBase64,
                    },
                },
            ];

            console.log("🤖 Chamando modelo de imagem:", IMAGE_MODEL);

            const response = await ai.models.generateContent({
                model: IMAGE_MODEL,
                contents: promptParts,
            });

            console.log(
                "📨 Resposta bruta do modelo (resumida):",
                JSON.stringify(
                    {
                        hasCandidates: !!response.candidates,
                        candidatesCount: response.candidates?.length,
                    },
                    null,
                    2
                )
            );

            // Parse defensivo da resposta
            let imagePart = null;
            if (response.candidates && response.candidates.length > 0) {
                console.log("✅ Candidates encontrados:", response.candidates.length);
                const candidate = response.candidates[0];

                if (candidate.content && candidate.content.parts) {
                    console.log("✅ Parts encontrados:", candidate.content.parts.length);
                    imagePart = candidate.content.parts.find(
                        (p) => p.inlineData && p.inlineData.data
                    );
                } else {
                    console.warn("⚠️  candidate.content ou candidate.content.parts não existe");
                }
            } else {
                console.warn("⚠️  response.candidates está vazio ou não existe");
            }

            if (!imagePart) {
                console.error("⚠️  Nenhuma imagem inlineData encontrada. Usando fallback.");

                // Remove arquivos temporários antes de retornar
                fs.unlinkSync(userImage.path);
                fs.unlinkSync(clothesImage.path);

                return res.json({
                    success: true,
                    isMock: true,
                    mimeType: "image/png",
                    imageBase64: FALLBACK_IMAGE_BASE64,
                });
            }

            console.log("✅ Imagem gerada encontrada!");
            console.log("   - mimeType:", imagePart.inlineData.mimeType);
            console.log("   - imageBase64 length:", imagePart.inlineData.data.length);

            // Retorna sucesso com a imagem gerada
            res.json({
                success: true,
                mimeType: imagePart.inlineData.mimeType || "image/png",
                imageBase64: imagePart.inlineData.data,
            });

            // Limpa arquivos temporários
            fs.unlinkSync(userImage.path);
            fs.unlinkSync(clothesImage.path);
            console.log("🗑️  Arquivos temporários removidos");
            console.log("✅ Requisição concluída com sucesso!");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        } catch (error) {
            console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.error("❌ ERRO ao gerar look com modelo de imagem:");
            console.error(error);
            console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            // Detecta erro de quota (status 429)
            const isQuotaError = error.status === 429 || error.code === 429;

            if (isQuotaError) {
                console.error("⚠️  ERRO DE QUOTA EXCEDIDA na IA. Usando fallback mock.");
                console.error("💡 DICA: Configure USE_MOCK_AI=true no .env para desenvolvimento sem quota.");
            }

            console.log("🔄 Retornando fallback de imagem para o frontend.");

            return res.json({
                success: true,
                isMock: true,
                errorCode: isQuotaError ? "QUOTA_EXCEEDED" : "GENERIC_ERROR",
                mimeType: "image/png",
                imageBase64: FALLBACK_IMAGE_BASE64,
            });
        }
    }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Backend do FitFlick rodando em http://localhost:${PORT}`);
});
