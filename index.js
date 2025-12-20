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
    const reviewCollections = db.collection("reviews");
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
    app.get("/allUsers", async (req, res) => {
      const { filterkey = "" } = req.query;
      const query = {};
      if (filterkey) {
        query.role = filterkey;
      }
      const result = await userCollections.find(query).sort().toArray();
      res.send(result);
    });
    app.patch("/users/:id/edit", async (req, res) => {
      const userId = req.params.id;
      const updatedRole = {
        $set: {
          role: req.body.role,
        },
      };
      const result = await userCollections.updateOne(
        { _id: new ObjectId(userId) },
        updatedRole
      );
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const userId = req.params.id;
      const result = await userCollections.deleteOne({
        _id: new ObjectId(userId),
      });
      res.send(result);
    });

    // Scholarship storage related apis here
    app.post("/scholarships", async (req, res) => {
      const scholarshipsInfo = req.body;
      scholarshipsInfo.postdate = new Date();
      const result = await ScholarshipCollection.insertOne(scholarshipsInfo);
      res.send(result);
    });
    app.patch("/scholarships/:id", async (req, res) => {
      const scholarsShipId = req.params.id;
      const updatedInfo = req.body;
      updatedInfo.applicationDeadline = new Date(
        updatedInfo.applicationDeadline
      );
      const result = await ScholarshipCollection.updateOne(
        { _id: new ObjectId(scholarsShipId) },
        { $set: updatedInfo }
      );
      res.send(result);
    });
    // All Scholarship api with search sort and filter functionality
    app.get("/scholarships", async (req, res) => {
      const {
        search = "",
        catagory ="",
        // subjectcatagory = "",
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
      // if (subjectcatagory) {
      //   query.subjectCategory = subjectcatagory;
      // }
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

    // Analitics api here for Dashboard analistics page

    app.get("/scholarship/analitics", async (req, res) => {
      const pipeLine = [
        {
          $match: { paymentStatus: "paid" },
        },
        {
          $group: {
            _id: "paid",
            totalCollectedFees: { $sum: "$applicationFees" },
            totalStudentPaid:{$sum:1}
          },
        },
      
      ];
      const applicationPeruniverCityPipeLIne=[
        {$group:{
          _id:'$universityName',
          applicationCout:{$sum:1}
        }}
      ]
      const collectedFees = await applicationCollections.aggregate(pipeLine).toArray();
      const applicationPerUniversity=await applicationCollections.aggregate(applicationPeruniverCityPipeLIne).toArray()
      const userCount=await userCollections.countDocuments()
      const scholarShipCount=await ScholarshipCollection.countDocuments()
      res.send({userCount,scholarShipCount,collectedFees,applicationPerUniversity,});
    });
    // Single scholarship get api
    app.get("/scholarship/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
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
        userId: apllicationInfo.userId,
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
      // console.log(sessoionId);
      const retrivedSession = await stripe.checkout.sessions.retrieve(
        sessoionId
      );
      const { customer_email, metadata, payment_intent, payment_status } =
        retrivedSession;
      // console.log(paidAmount)
      const query = {
        userEmail: customer_email,
        scholarshipId: metadata.scholarshipId,
      };
      updatedInfo = {
        $set: { paymentStatus: "paid", transitionId: payment_intent },
      };
      if (payment_status === "paid") {
        const result = await applicationCollections.updateOne(
          query,
          updatedInfo
        );
      }
      res.send({ payment_intent, metadata });
    });
    app.get("/applications", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.userEmail = email;
      }
      const result = await applicationCollections.find(query).toArray();
      res.send(result);
    });
    // apllication delte api
    app.delete("/apllications/:id", async (req, res) => {
      const id = req.params.id;
      const result = await applicationCollections.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // apllication update api
    app.patch("/apllications/:id", async (req, res) => {
      const id = req.params.id;
      updatedApplication = {
        $set: { userName: req.body.name },
      };
      const result = await applicationCollections.updateOne(
        { _id: new ObjectId(id) },
        updatedApplication
      );
      res.send(result);
    });
    // application update Api for update apllication status only of moderator
    app.patch("/applications/:id/applicationStatus", async (req, res) => {
      const id = req.params.id;
      const updatedStatus = {
        $set: {
          applicationStatus: req.body.status,
        },
      };
      const result = await applicationCollections.updateOne(
        { _id: new ObjectId(id) },
        updatedStatus
      );
      res.send(result);
    });
    // Application feedbach Added Api
    app.patch("/applications/:id/feedback", async (req, res) => {
      const id = req.params.id;
      const updatedStatus = {
        $set: {
          feedback: req.body.feedback,
        },
      };
      const result = await applicationCollections.updateOne(
        { _id: new ObjectId(id) },
        updatedStatus
      );
      res.send(result);
    });
    // Review Post section
    app.post("/reviews", async (req, res) => {
      const reviewInfo = req.body;
      const isExist = await reviewCollections.findOne({
        scholarshipId: reviewInfo.scholarshipId,
        reviewerEmail: reviewInfo.reviewerEmail,
      });
      if (isExist) {
        return res.status(400).send({
          message: "You already given you opinion",
        });
      }
      reviewInfo.postAt = new Date();
      const result = await reviewCollections.insertOne(reviewInfo);
      res.send(result);
    });
    // Review get api here my reviews for studnt dashboard and all reviews for modarator dashboard
    app.get("/reviews", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.reviewerEmail = email;
      }
      const result = await reviewCollections
        .find(query)
        .sort({ postAt: -1 })
        .toArray();
      res.send(result);
    });
    app.get('/reviews/:scholarshipId',async(req,res)=>{
      const id=req.params.scholarshipId
      const result=await reviewCollections.find({scholarshipId:id}).toArray()
      res.send(result)
    })
    app.patch("/reviews/:id/edit", async (req, res) => {
      const reviewId = req.params.id;
      const reviewInfo = req.body;
      const updatedInfo = {
        $set: {
          reviewComment: reviewInfo.reviewComment,
          reviewStar: reviewInfo.reviewStar,
        },
      };
      const result = await reviewCollections.updateOne(
        { _id: new ObjectId(reviewId) },
        updatedInfo
      );
      res.send(result);
    });
    app.delete("/reviews/:id", async (req, res) => {
      const reviewId = req.params.id;
      const result = await reviewCollections.deleteOne({
        _id: new ObjectId(reviewId),
      });
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch();
app.listen(port, () => {
  // console.log(`Example app listening on port ${port}`);
});
