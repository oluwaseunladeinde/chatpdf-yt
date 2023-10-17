import {Configuration, OpenAIApi} from 'openai-edge';
import {OpenAIStream, StreamingTextResponse} from 'ai';
import { getContext } from '@/lib/context';
import { db } from '@/lib/db';
import { chats, messages as _messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { Message } from 'ai/react';

export const runtime = "edge";

const config = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
})

const openai = new OpenAIApi(config);

export async function POST(req:Request){
    try {
        const {messages, chatId} = await req.json();
        const _chats = await db.select().from(chats).where(eq(chats.id, chatId));
        if (_chats.length != 1){
            return NextResponse.json({'error': 'chat not found'}, {status: 404});
        }
        const fileKey = _chats[0].fileKey
        const lastMessage = messages[messages.length - 1];
        const context = await getContext(lastMessage.content, fileKey);

        const prompt = {
            role: 'system',
            content: `AI assistant is a brand new, powerful, human-like artificial intelligence.
            The traits of AI includes expert knowledge, helpfulness, cleverness, and articulateness. 
            AI is a well-behaved and well-mannered individual. 
            AI is always friendly, kind, and inspirin, and he is eager to provide vivid and thoughful responses to the user. 
            AI has a lot of knowlegde in their brain and is able to accurately answer nearly any question about any topic of interest. 
            AI assistant is a big fan of pinecone and Vercel. 
            START CONTEXT BLOCK 
            ${context}
            END CONTEXT BLOCK
            AI assistant will take into account any CONTEXT BLOCK that is provided in the conversation. 
            If the context does not provide the answer to teh question, the AI assistant will say "I'm sorry, but I don't know the answer to that question"
            AI assistant will not apologize for previous responses, but instead will indicate new information was gained.
            AI assistant will not invent anything that is not drawn directly from the context
            `,
        }

        const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: {
                prompt, 
                ...messages.filter((message: Message) => message.role === 'user'), 
            },
            stream: true
        });
        const stream = OpenAIStream(response, {
            onStart: async () => {
                // save user message into database
                await db.insert(_messages).values({
                    chatId,
                    content: lastMessage.content,
                    role: 'user'
                })
            },
            onCompletion: async (completion) => {
                // save ai message into database
                await db.insert(_messages).values({
                    chatId,
                    content: completion,
                    role: 'system'
                })
            }
        });
        return new StreamingTextResponse(stream);
    } catch (error) {
        
    }
}
