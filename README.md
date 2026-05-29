//Solo project May 2026 
//Demonstrates 6 ways to search in MongoDB Atlas
//
//The demo is based on a use case that involves searching for luxury accommodation based on free text entered by the user or on specific criteria  
// such as location and price
//
//Option 1: uses atlas Search to search our bluebook collection , this option does not take text from the free text search box but searches based on
//the criteria provided in the location , price and rating fields
//
//Option 2:
//Takes text from the free text search box and uses an LLM (Open AI) to formulate an atlas search query similar to the one used for option 1 to search
//our bluebook collection
//
//Option 3:
//Uses criteria entered by the user to carry out a semantic search based on combined keyword and semantic retrieval based on the information provided
//in the freetext search box, uses voyage ai/auto embeddings
//
//Option 4:
//Takes text entered in free text search box and passes to an LLM
//
//Option 5:
//This option is intended to use RAG but should fail because we do not have any embeddings in our bluebook collection
//
//Option 6:
//This option uses RAG based on voyage AI embeddings and find accommodation based on our search criteria and brings back information on recreational activities
//based in the area 
//

