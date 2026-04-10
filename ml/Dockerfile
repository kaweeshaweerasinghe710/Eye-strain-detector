# Use a slim Python 3.10 image to keep the container lightweight
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file first to leverage Docker caching
COPY requirements.txt .

# Install dependencies. 
# We use --no-cache-dir to keep the image size small
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Hugging Face Spaces MUST expose port 7860
EXPOSE 7860

# Run the Flask app using Gunicorn on port 7860
CMD ["gunicorn", "-b", "0.0.0.0:7860", "app:app"]