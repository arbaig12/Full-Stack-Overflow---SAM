import React, { useState } from 'react';

// Sample user data
const sampleUsers = [
  {
    id: '123456',
    name: 'John Doe',
    email: 'john.doe@example.edu',
    role: 'student',
    status: 'active',
    lastLogin: '2025-01-15',
    department: 'Computer Science',
    classStanding: 'U3'
  },
  {
    id: '234567',
    name: 'Jane Smith',
    email: 'jane.smith@example.edu',
    role: 'student',
    status: 'active',
    lastLogin: '2025-01-14',
    department: 'Computer Science',
    classStanding: 'U2'
  },
  {
    id: '345678',
    name: 'Dr. Robert Johnson',
    email: 'r.johnson@example.edu',
    role: 'instructor',
    status: 'active',
    lastLogin: '2025-01-15',
    department: 'Computer Science',
    courses: ['CSE101', 'CSE214']
  },
  {
    id: '456789',
    name: 'Prof. Sarah Wilson',
    email: 's.wilson@example.edu',
    role: 'advisor',
    status: 'active',
    lastLogin: '2025-01-13',
    department: 'Computer Science',
    advisees: 25
  },
  {
    id: '567890',
    name: 'Admin User',
    email: 'admin@example.edu',
    role: 'registrar',
    status: 'active',
    lastLogin: '2025-01-15',
    department: 'Administration'
  },
  {
    id: '678901',
    name: 'Inactive Student',
    email: 'inactive@example.edu',
    role: 'student',
    status: 'inactive',
    lastLogin: '2024-12-01',
    department: 'Mathematics',
    classStanding: 'U1'
  }
];

export default function UserManagement() {
  const [users, setUsers] = useState(sampleUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [message, setMessage] = useState('');

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.id.includes(searchTerm);
    const matchesRole = selectedRole === 'All' || user.role === selectedRole;
    const matchesStatus = selectedStatus === 'All' || user.status === selectedStatus;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleEdit = (user) => {
    setEditingUser(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      department: user.department || '',
      classStanding: user.classStanding || '',
      courses: user.courses ? user.courses.join(', ') : '',
      advisees: user.advisees || ''
    });
  };

  const handleSave = (userId) => {
    const updatedUsers = users.map(user => {
      if (user.id === userId) {
        const updatedUser = {
          ...user,
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          status: editForm.status,
          department: editForm.department,
          classStanding: editForm.classStanding || undefined,
          courses: editForm.courses ? editForm.courses.split(',').map(c => c.trim()) : undefined,
          advisees: editForm.advisees ? parseInt(editForm.advisees) : undefined
        };
        return updatedUser;
      }
      return user;
    });
    
    setUsers(updatedUsers);
    setEditingUser(null);
    setMessage('User updated successfully');
  };

  const handleCancel = () => {
    setEditingUser(null);
    setEditForm({});
  };

  const handleDelete = (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(user => user.id !== userId));
      setMessage('User deleted successfully');
    }
  };

  const handleStatusToggle = (userId) => {
    const updatedUsers = users.map(user => {
      if (user.id === userId) {
        return { ...user, status: user.status === 'active' ? 'inactive' : 'active' };
      }
      return user;
    });
    setUsers(updatedUsers);
    setMessage('User status updated successfully');
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'student': return '#2196f3';
      case 'instructor': return '#4caf50';
      case 'advisor': return '#ff9800';
      case 'registrar': return '#9c27b0';
      default: return '#666';
    }
  };

  const getStatusColor = (status) => {
    return status === 'active' ? '#4caf50' : '#f44336';
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>User Management</h1>
      
      {/* Filters */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 150px 150px', 
        gap: 16, 
        marginBottom: 24,
        alignItems: 'end'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Search Users
          </label>
          <input
            type="text"
            placeholder="Search by name, email, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
            }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="All">All Roles</option>
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
            <option value="advisor">Advisor</option>
            <option value="registrar">Registrar</option>
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="All">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          borderRadius: 6,
          background: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb'
        }}>
          {message}
        </div>
      )}

      {/* Results count */}
      <p style={{ marginBottom: 16, color: '#666' }}>
        Showing {filteredUsers.length} of {users.length} users
      </p>

      {/* User List */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e0e0e0',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          padding: 16,
          background: '#f8f9fa',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 'bold'
        }}>
          User Directory
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  User ID
                </th>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Name
                </th>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Email
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Role
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Status
                </th>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Department
                </th>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Details
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => (
                <tr key={user.id} style={{ 
                  background: index % 2 === 0 ? '#fff' : '#f9f9f9' 
                }}>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {user.id}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {editingUser === user.id ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          width: '100%'
                        }}
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {editingUser === user.id ? (
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          width: '100%'
                        }}
                      />
                    ) : (
                      user.email
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {editingUser === user.id ? (
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 4
                        }}
                      >
                        <option value="student">Student</option>
                        <option value="instructor">Instructor</option>
                        <option value="advisor">Advisor</option>
                        <option value="registrar">Registrar</option>
                      </select>
                    ) : (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 'bold',
                        background: getRoleColor(user.role),
                        color: 'white',
                        textTransform: 'capitalize'
                      }}>
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {editingUser === user.id ? (
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 4
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    ) : (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 'bold',
                        background: getStatusColor(user.status),
                        color: 'white',
                        textTransform: 'capitalize'
                      }}>
                        {user.status}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {editingUser === user.id ? (
                      <input
                        type="text"
                        value={editForm.department}
                        onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          width: '100%'
                        }}
                      />
                    ) : (
                      user.department
                    )}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {user.role === 'student' && (
                      <div style={{ fontSize: 12, color: '#666' }}>
                        Class: {user.classStanding}
                      </div>
                    )}
                    {user.role === 'instructor' && user.courses && (
                      <div style={{ fontSize: 12, color: '#666' }}>
                        Courses: {user.courses.join(', ')}
                      </div>
                    )}
                    {user.role === 'advisor' && user.advisees && (
                      <div style={{ fontSize: 12, color: '#666' }}>
                        Advisees: {user.advisees}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#666' }}>
                      Last login: {user.lastLogin}
                    </div>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {editingUser === user.id ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          onClick={() => handleSave(user.id)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#28a745',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancel}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#6c757d',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEdit(user)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#007bff',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleStatusToggle(user.id)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: user.status === 'active' ? '#ffc107' : '#28a745',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          {user.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#dc3545',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: 40, 
          color: '#666',
          background: '#f9f9f9',
          borderRadius: 8,
          border: '1px solid #e0e0e0',
          marginTop: 20
        }}>
          <p>No users found matching your criteria.</p>
          <p>Try adjusting your search terms or filters.</p>
        </div>
      )}
    </div>
  );
}
