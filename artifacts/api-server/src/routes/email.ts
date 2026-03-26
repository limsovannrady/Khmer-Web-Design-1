import { Router, type IRouter } from "express";
import { CreateEmailResponse, GetMessagesParams, GetMessagesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const DROPMAIL_TOKEN_ID = process.env.DROPMAIL_TOKEN_ID ?? "";
const DROPMAIL_URL = `https://dropmail.me/api/graphql/${DROPMAIL_TOKEN_ID}`;

async function dropMailQuery(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(DROPMAIL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`DropMail API error: ${response.status}`);
  }

  const data = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };

  if (data.errors && data.errors.length > 0) {
    throw new Error(data.errors[0].message);
  }

  return data.data;
}

router.post("/create", async (_req, res) => {
  try {
    const data = await dropMailQuery(`
      mutation {
        introduceSession {
          id
          expiresAt
          addresses {
            address
          }
        }
      }
    `) as { introduceSession: { id: string; expiresAt: string; addresses: Array<{ address: string }> } };

    const session = data.introduceSession;
    const email = session.addresses[0]?.address ?? "";

    const result = CreateEmailResponse.parse({
      sessionId: session.id,
      email,
      expiresAt: session.expiresAt,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "មិនអាចបង្កើត Email បានទេ" });
  }
});

router.get("/:sessionId/messages", async (req, res) => {
  try {
    const { sessionId } = GetMessagesParams.parse({ sessionId: req.params.sessionId });

    const data = await dropMailQuery(`
      query GetMessages($id: ID!) {
        session(id: $id) {
          mails {
            id
            fromAddr
            toAddr
            headerSubject
            receivedAt
            text
            html
          }
        }
      }
    `, { id: sessionId }) as {
      session: {
        mails: Array<{
          id: string;
          fromAddr: string;
          toAddr: string;
          headerSubject: string;
          receivedAt: string;
          text: string;
          html: string;
        }>;
      } | null;
    };

    if (!data.session) {
      res.status(500).json({ error: "Session មិនត្រឹមត្រូវ" });
      return;
    }

    const messages = (data.session.mails ?? []).map((m) => ({
      id: m.id,
      fromAddr: m.fromAddr,
      toAddr: m.toAddr,
      headerSubject: m.headerSubject || "(មិនមានប្រធានបទ)",
      receivedAt: m.receivedAt,
      text: m.text ?? "",
      html: m.html ?? "",
    }));

    const result = GetMessagesResponse.parse({ messages });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "មិនអាចទទួលបាន Messages" });
  }
});

export default router;
