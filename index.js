const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
const stripe = require("stripe")(process.env.STRIPE_KEY);
app.use(express.static("public"));

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.URI;

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
    const db = client.db("ScholarStream");
    const userCollections = db.collection("users");
    const ScholarshipCollection = db.collection("Scholarships");
    const applicationCollections = db.collection("apllications");
    // User Related apis here
    // user post api
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "student";
      const isExist = await userCollections.findOne({ email: userInfo.email });
      if (isExist) {
        return res.status(409).send({
          message: "User Record already exists",
        });
      }
      const result = await userCollections.insertOne(userInfo);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      const result = await userCollections.findOne({ email: email });
      res.send(result);
    });
    // Scholarship storage related apis here
    app.post("/scholarships", async (req, res) => {
      const scholarshipsInfo = req.body;
      scholarshipsInfo.postdate = new Date();
      const result = await ScholarshipCollection.insertOne(scholarshipsInfo);
      res.send(result);
    });
    // All Scholarship api with search sort and filter functionality
    app.get("/scholarships", async (req, res) => {
      const {
        search = "",
        catagory = "",
        subjectcatagory = "",
        country = "",
        sortby = "",
        order = "",
        limit = 0,
        skip = 0,
      } = req.query;
      const query = {};
      const sortQurey = {};
      if (search) {
        query.$or = [
          { scholarshipName: { $regex: search, $options: "i" } },
          { universityName: { $regex: search, $options: "i" } },
          { degree: { $regex: search, $options: "i" } },
        ];
      }
      if (catagory) {
        query.scholarshipCategory = catagory;
      }
      if (subjectcatagory) {
        query.subjectCategory = subjectcatagory;
      }
      if (country) {
        query.universityCountry = country;
      }

      if (sortby) {
        sortQurey[sortby] = order === "asc" ? 1 : -1;
      }
      const result = await ScholarshipCollection.find(query)
        .sort(sortQurey)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .toArray();
      const count = await ScholarshipCollection.countDocuments(query);
      res.send({ ScholarshipData: result, count });
    });
    // Single scholarship get api
    app.get("/scholarship/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ScholarshipCollection.findOne(query);
      res.send(result);
    });
    // Payment related apis///////////////////////////////////////////////////
    // payment Createtion api
    app.post("/create-checkout-session", async (req, res) => {
      const apllicationInfo = req.body;
      const {
        applicationFees,
        userEmail,
        scholarshipId,
        scholarshipName,
        universityName,
      } = apllicationInfo;
      const isExist = await applicationCollections.findOne({
        scholarshipId: scholarshipId,
        userEmail: userEmail,
        userId:apllicationInfo.userId

      });
      if (isExist && isExist.paymentStatus === "paid") {
        return res.status(400).send({
          message: "You already applied scholarship!",
        });
      }
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "USD",
              unit_amount: parseInt(applicationFees * 100),
              product_data: {
                name: scholarshipName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: userEmail,
        metadata: {
          scholarshipId: scholarshipId,
          scholarshipName: scholarshipName,
          universityName: universityName,
          paidAmount: applicationFees,
        },
        mode: "payment",
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
      });
      apllicationInfo.applicationDate = new Date();
      if (!isExist) {
        const result = await applicationCollections.insertOne(apllicationInfo);
      }
      res.send({ url: session.url });
    });
    // Session retrive api here///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    app.patch("/applicationFeeStatus-status", async (req, res) => {
      const sessoionId = req.query.sessoinId;
      console.log(sessoionId)
      const retrivedSession = await stripe.checkout.sessions.retrieve(
        sessoionId
      );
      const{customer_email,  metadata,payment_intent, payment_status}=retrivedSession
      // console.log(paidAmount)
      const query={userEmail:customer_email,scholarshipId:metadata.scholarshipId}
      updatedInfo={
        $set:{paymentStatus:'paid',transitionId:payment_intent}
      }
      if(payment_status==='paid'){
        const result=await applicationCollections.updateOne(query,updatedInfo)
      }
      res.send({payment_intent,metadata})
    });
    app.get('/applications',async(req,res)=>{
      const email=req.params.email
      const query={ }
      if(email){
        query.userEmail=email
      }
      const result=await applicationCollections.find(query).toArray()
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
