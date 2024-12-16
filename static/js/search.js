function displayResults(books) {
    const resultsTable = document.getElementById('resultsTable');
    const resultsBody = document.getElementById('resultsBody');
    
    if (books.length === 0) {
        showMessage('Nessun libro trovato');
        resultsTable.style.display = 'none';
        return;
    }

    resultsBody.innerHTML = books.map(book => `
        <tr>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.isbn}</td>
            <td>${book.publish_date}</td>
            <td>${book.genres}</td>
            <td>${book.location || 'Non specificata'}</td>
        </tr>
    `).join('');

    resultsTable.style.display = 'table';
}