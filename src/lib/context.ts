import { Pinecone, Vector } from "@pinecone-database/pinecone";
import { convertToAscii } from "./utils";
import { getEmbeddings } from "./embeddings";

export async function getMatchesFromEmbeddings(embeddings: number[], fileKey: string){
    const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
        environment: process.env.PINECONE_ENVIRONMENT!,
    })

    const index = await pinecone.index('chatpdf-yti');

    try{
        const namespace = convertToAscii(fileKey);
        //const queryResult = await index.namespace(namespace).query({
        const queryResult = await index.query({
            topK: 5,
            vector: embeddings,
            includeMetadata: true,
        })
        return queryResult.matches || []
    } catch (error){
       console.log('error querying embeddings ', error);
       return error;
    }
}

export async function getContext(query: string, fileKey: string){
    const queryEmbeddings = await getEmbeddings(query);
    const matches = await getMatchesFromEmbeddings(queryEmbeddings, fileKey);

    const qualifyingDOcs = matches.filter(
        (match) => match.score && match.score > 0.7
    ); 

    type Metadata = {
        text: string, 
        pageNumber: number,
    }

    let docs = qualifyingDOcs.map(docmatch => (docmatch.metadata as Metadata).text);
    return docs.join('\n').substring(0, 3000);
}