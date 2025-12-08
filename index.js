const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
console.log(process.env.URI)
const uri =process.env.URI

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
app.get("/", (req, res) => {
  res.send("Server Initialzied");
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db=client.db('ScholarStream')
    const userCollections=db.collection('users')
    const ScholarshipCollection=db.collection('Scholarships')
    // User Related apis here 
    // user post api
    app.post('/users',async(req,res)=>{
      const userInfo=req.body;
      userInfo.role='student'
      const isExist=await userCollections.findOne({email:userInfo.email})
      if(isExist){
        return  res.status(409).send({ 
      message: "User Record already exists" 
    })
      }
      const result=await userCollections.insertOne(userInfo)
      res.send(result)
    })
    app.get('/users',async(req,res)=>{
      const email=req.query.email
      const result=await userCollections.findOne({email:email})
      res.send(result)
    })
    // Scholarship storage related apis here
    app.post('/scholarships',async(req,res)=>{
      const scholarshipsInfo=req.body;
      scholarshipsInfo.postdate=new Date()
      const result=await ScholarshipCollection.insertOne(scholarshipsInfo)
      res.send(result)
    })
    app.get('/scholarships',async(req,res)=>{
      const result=await ScholarshipCollection.find().toArray()
      res.send(result)
    })
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
