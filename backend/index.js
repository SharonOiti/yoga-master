const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// mongodb connection
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@yoga-master.vldmm.mongodb.net/?retryWrites=true&w=majority&appName=yoga-master`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log('MongoDB connected');

    // Create a database and collections
    const database = client.db("yoga-master");
    const classesCollection = database.collection("classes");
    // Classes route - Handles inserting multiple classes
    app.post('/new-class', async (req, res) => {
      const newClasses = req.body;

      try {
        // Insert many classes at once into the MongoDB collection
        const result = await classesCollection.insertMany(newClasses);
        console.log("Inserted classes:", result); // Log the result to confirm insertion
        res.send(result);
      } catch (error) {
        console.error("Error inserting classes:", error);
        res.status(500).send({ message: "Error inserting classes", error });
      }
    });

    // Get classes route - Returns all classes or filtered by instructor email
    app.get('/classes', async (req, res) => {
      const { instructorEmail } = req.query;  // Use query parameter to filter by email

      try {
        let result;

        if (instructorEmail) {
          // Query MongoDB for classes with the provided instructor email
          result = await classesCollection.find({ instructoremail: instructorEmail }).toArray();
        } else {
          // If no email is provided, return all classes
          result = await classesCollection.find().toArray();
        }

        console.log("Classes fetched:", result); // Log the result for debugging
        res.send(result);
      } catch (error) {
        console.error("Error retrieving classes:", error);
        res.status(500).send({ message: "Error retrieving classes", error });
      }
    });

    // Manage classes route
    app.get('/classes-manage', async (req, res) => {
      try {
        const result = await classesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error retrieving classes to manage:", error);
        res.status(500).send({ message: "Error retrieving classes", error });
      }
    });
    
    // Update class status and reason
    app.patch('/change-status/:id', async (req, res) => {
      const id = req.params.id; // Get ID from URL params
      const { status, reason } = req.body; // Get status and reason from the body

      const filter = { _id: new ObjectId(id) }; // Filter for matching ID
      const updateDoc = {
        $set: {
          status: status,
          reason: reason
        },
      };

      const options = { upsert: false }; // Don't insert a new document if the ID doesn't exist

      try {
        const result = await classesCollection.updateOne(filter, updateDoc, options);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Class not found' });
        }

        res.send({ message: 'Class status updated successfully', result });
      } catch (error) {
        console.error("Error updating class status:", error);
        res.status(500).send({ message: "Error updating status", error });
      }
    });

    // Get approved classes 
    app.get('/approved-classes', async (req, res) => {
      try {
        // Query MongoDB for classes where status is 'Active'
        const approvedClasses = await classesCollection.find({ status: 'Active' }).toArray();

        // Log the results to see what's returned
        console.log('Approved Classes:', approvedClasses);

        if (approvedClasses.length === 0) {
          // If no approved classes found, send a message
          res.status(404).send({ message: "No approved classes found." });
        } else {
          res.send(approvedClasses);
        }
      } catch (error) {
        console.error("Error retrieving approved classes:", error);
        res.status(500).send({ message: "Error retrieving approved classes", error });
      }
    });

    // Route to add class to the cart
    app.post('/add-to-cart', async (req, res) => {
      const { classId } = req.body;  // Get the classId from the request body
      const userId = 'guest'; // Default user for a guest (or can be dynamically set later)
  
      // Check if classId is provided in the request body
      if (!classId) {
          return res.status(400).send({ message: 'ClassId is required.' });
      }
  
      try {
          // Find the class in the classes collection by classId
          const classData = await classesCollection.findOne({ _id: new ObjectId(classId) });
  
          // If the class doesn't exist, return 404
          if (!classData) {
              return res.status(404).send({ message: 'Class not found.' });
          }
  
          // Find the user's cart in the 'cart' collection (using 'guest' if no userId exists)
          let cart = await client.db('yoga-master').collection('cart').findOne({ userId });
  
          // If the cart does not exist, create a new one
          if (!cart) {
              cart = {
                  userId: userId,
                  cartItems: []  // Initialize empty cartItems array
              };
          }
  
          // Check if the class is already in the cart
          const existingClassIndex = cart.cartItems.findIndex(item => item.classId === classId);
  
          if (existingClassIndex !== -1) {
              // If the class is already in the cart, increment its quantity
              cart.cartItems[existingClassIndex].quantity += 1;
          } else {
              // Otherwise, add the class as a new item in the cart
              cart.cartItems.push({
                  classId: classId,
                  className: classData.name,
                  price: classData.price,
                  quantity: 1
              });
          }
  
          // Save the updated cart to the database (upsert: create or update)
          await client.db('yoga-master').collection('cart').updateOne(
              { userId },  // Find the user's cart using userId
              { $set: { cartItems: cart.cartItems } },  // Update the cartItems array
              { upsert: true }  // Insert if no cart is found for the userId
          );
  
          // Send a success response back with the updated cart data
          res.send({ message: 'Class added to cart successfully!', cart });
  
      } catch (error) {
          console.error('Error adding class to cart:', error);
          res.status(500).send({ message: 'Error adding class to cart', error });
      }
    });

    // Route to get cart items by userId
    app.get('/get-cart/:userId', async (req, res) => {
        const { userId } = req.params;  // Get userId from the URL parameters
  
        try {
            // Find the user's cart in the 'cart' collection
            const cart = await client.db('yoga-master').collection('cart').findOne({ userId });
  
            if (!cart) {
                return res.status(404).send({ message: 'Cart not found for this user.' });
            }
  
            // Return the cart data if found
            res.send(cart);
        } catch (error) {
            console.error('Error retrieving cart:', error);
            res.status(500).send({ message: 'Error retrieving cart', error });
        }
    });
    //cart info by user email
    app.get('/cart/:email', async (req,res)=> {
        const email = req.params.email;
        const query = { userMail: email};
        const projection = {classId:1};
        const carts = await cartCollection(query, {prjection: projection});
        const classIds = carts.mmap((cart)=> new ObjectId(cart.classId));
        const query2 = {_id:{$in: classIds}};
        const result = await classesCollection.find(query2).toArray();
        res.send(result);
    })
    // delete cart item
    app.delete('/delete-cart-item/:id', async (req, res)=> {
        const id = req.params.id;
        const query = {classId: id};
        const result = await cartCollection.deleteOne(query);
        res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (err) {
    console.error("Error while connecting to MongoDB:", err);
  }
}

// Initialize MongoDB connection
run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
  res.send('Hello World, this is my yoga master server!');
});

// Start the Express server
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});