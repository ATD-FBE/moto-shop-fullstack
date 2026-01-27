export default function moveKeyToEndInFormData(formData, keyToMoveLast) {
    const newFormData = new FormData();
    
    for (const [key, value] of formData.entries()) {
        if (key !== keyToMoveLast) {
            newFormData.append(key, value);
        }
    }

    for (const [key, value] of formData.entries()) {
        if (key === keyToMoveLast) {
            newFormData.append(key, value);
        }
    }

    return newFormData;
};
