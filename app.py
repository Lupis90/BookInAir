from flask import Flask, render_template, jsonify, request
import requests
import sqlite3
from datetime import datetime

app = Flask(__name__, static_url_path='/static')

def init_db():
    conn = sqlite3.connect('books.db')
    c = conn.cursor()
    
    # Verifica se la colonna genres esiste già
    cursor = c.execute('PRAGMA table_info(books)')
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'genres' not in columns:
        # Aggiunge la colonna genres se non esiste
        c.execute('ALTER TABLE books ADD COLUMN genres TEXT DEFAULT "Unknown"')
    
    conn.commit()
    conn.close()

@app.route('/update_location/<isbn>', methods=['POST'])
def update_location(isbn):
    location = request.json.get('location')
    try:
        conn = sqlite3.connect('books.db')
        c = conn.cursor()
        c.execute('UPDATE books SET location = ? WHERE isbn = ?', (location, isbn))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': 'Location updated'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

def search_google_books(isbn):
    api_url = f"https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}"
    response = requests.get(api_url)
    if response.status_code == 200:
        data = response.json()
        if data.get('items'):
            book = data['items'][0]['volumeInfo']
            return {
                'title': book.get('title', 'Unknown'),
                'author': book.get('authors', ['Unknown'])[0],
                'publish_date': book.get('publishedDate', 'Unknown'),
                'genres': ', '.join(book.get('categories', ['Unknown']))
            }
    return None

def search_open_library(isbn):
    response = requests.get(f'https://openlibrary.org/isbn/{isbn}.json')
    if response.status_code == 200:
        book_data = response.json()
        subjects = book_data.get('subjects', ['Unknown'])
        genres = subjects[:3] if len(subjects) > 3 else subjects
        
        return {
            'title': book_data.get('title', 'Unknown'),
            'author': book_data.get('authors', [{}])[0].get('name', 'Unknown'),
            'publish_date': book_data.get('publish_date', 'Unknown'),
            'genres': ', '.join(genres)
        }
    return None

@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/scanner')
def scanner():
    return render_template('scanner.html')

@app.route('/search')
def search():
    return render_template('search.html')

@app.route('/books')
def get_books():
    conn = sqlite3.connect('books.db')
    c = conn.cursor()
    c.execute('SELECT * FROM books')
    books = [{'isbn': row[0], 'title': row[1], 'author': row[2], 
              'publish_date': row[3], 'location': row[4], 'genres': row[5]} 
             for row in c.fetchall()]
    conn.close()
    return jsonify(books)

@app.route('/process_isbn', methods=['POST'])
def process_isbn():
    isbn = request.json.get('isbn')
    
    book_info = search_google_books(isbn) or search_open_library(isbn) or {
        'title': 'Book not found',
        'author': 'Unknown',
        'publish_date': 'Unknown',
        'genres': 'Unknown'
    }
    
    conn = sqlite3.connect('books.db')
    c = conn.cursor()
    c.execute('INSERT OR REPLACE INTO books VALUES (?, ?, ?, ?, ?, ?)',
             (isbn, book_info['title'], book_info['author'], 
              book_info['publish_date'], 'Non specificata', book_info['genres']))
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'isbn': isbn,
        'book_info': book_info
    })

@app.route('/search_books')
def search_books():
    search_type = request.args.get('type')
    query = request.args.get('query')
    
    if not search_type or not query:
        return jsonify([])
    
    conn = sqlite3.connect('books.db')
    c = conn.cursor()
    
    search_query = f"%{query}%"
    if search_type == 'title':
        c.execute('SELECT * FROM books WHERE title LIKE ?', (search_query,))
    else:  # author
        c.execute('SELECT * FROM books WHERE author LIKE ?', (search_query,))
    
    books = [{'isbn': row[0], 
              'title': row[1], 
              'author': row[2], 
              'publish_date': row[3],
              'location': row[4],
              'genres': row[5]} 
             for row in c.fetchall()]
    
    conn.close()
    return jsonify(books)

@app.route('/delete_book/<isbn>', methods=['DELETE'])
def delete_book(isbn):
    try:
        conn = sqlite3.connect('books.db')
        c = conn.cursor()
        c.execute('DELETE FROM books WHERE isbn = ?', (isbn,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success', 'message': 'Book deleted successfully'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
